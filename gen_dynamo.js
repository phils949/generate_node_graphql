const fs = require('fs');
const config_file = './schema/schema_ddb.json';
const schema_file = './schema/schema_ddb.js';
const model_out_folder = './models/';
const schema_model_folder = '../models/';
const model_suffix = '_ddb.js';

//-------------------------------------------------
//	Search for the named entity through the cfg.relations array
//-------------------------------------------------
function findRelation( cfg, entityName ) {
	let found = [];
	cfg.relations.forEach( (rel, idx) => {
		if ( rel.originatingEntity == entityName || rel.finalEntity == entityName ) {
			found.push( rel );
		}
	});
	return found;
}


//-------------------------------------------------
//	Search for the named entity through the cfg.relations array
//-------------------------------------------------
function findEntity( cfg, entityName ) {
	let found = undefined;
	cfg.entities.forEach( (ent, idx) => {
		if ( ent.name == entityName || ent.class == entityName ) {
			found = ent;
			return;
		}
	});
	return found;
}


//-------------------------------------------------
// Returns object:
//		.model - a string for the model output file
//		.schemaType
//		.schemaMutations
//		.schemaQueries
//		.types
//-------------------------------------------------
function gen_entity( cfg, entity ) {
	var delim = ','
	var mfields = '';
	var smaArgs = '';
	var smaFields= '';
	var tfields = '		id: { type: GraphQLID },\n';
	var smuArgs = `\t\t\t\t${entity.pkey}: {type: new GraphQLNonNull(GraphQLString)}${delim}\n`;
	var smuFields = '';
	var oTypes = {};
	var mkeys = `"${entity.pkey}"`;
	var smdArgs = `\t\t\t\t${entity.pkey}: {type: GraphQLID}`;
	if (entity.sortkey !== undefined) {
		mkeys += `, "${entity.sortkey}"`;
		smdArgs += `,\n\t\t\t\t${entity.sortkey}: {type: GraphQLString}`;
	}
	

	console.log(`inside gen_entity(). name=${entity.name}`);
	entity.fields.forEach( (fld,idx) => {
		let typ = '';
		if (idx+1 == entity.fields.length) { delim = ''; }
		if (!(fld.type in oTypes)) { oTypes[fld.type] = `GraphQL${fld.type}`; }
		typ = `GraphQL${fld.type}`;
		mfields += `		${fld.name}: "${fld.type}"${delim}\n`;
		tfields += `		${fld.name}: { type: ${typ} }${delim}\n`;

		//--- Accumulate field list for Schema Mutation - Add - Args
		smaArgs += `				${fld.name}: {type: ${(fld.isNull == false) ? "new GraphQLNonNull(" + typ + ")" : typ}}${delim}\n`;

		//--- Accumulate field list for Schema Mutation - Add - Resolve-Fields
		smaFields += `					${fld.name}:args.${fld.name}${delim}\n`;

		if (fld.name != entity.pkey) {

			//--- Accumulate field list for use in Schema Mutation - Update - Args
			smuArgs += `\t\t\t\t${fld.name}: { type: ${typ} }${delim}\n`;

			//--- Accumulate field list for use in Schema Mutation - Update - Set-Fields
			smuFields += `${fld.name}: args.${fld.name}${delim} `;
		}

	});

	//---- Extend schema Object Type fields for any relations that involve this Entity
	let foundRel = findRelation( cfg, entity.name );
	foundRel.forEach( (rel, relidx) => {

		//----> Set up parameters based on Originating or Final
		var funcName, entName, className, fldName, keyName, relType, idxName, idxKey, dataReturn, funcName;
		idxName = rel.altIndex;
		idxKey = rel.altIndexPkey;
		if (rel.originatingEntity == entity.name) {
			otherCardinality = rel.finalCardinality;
			entName=rel.finalEntity;	//geoCountry
			otherEnt = findEntity( cfg, entName );
			className=otherEnt.class;	//GeoCountry
			fldName=rel.finalField;		//geoCountries
			thisPKey=rel.originatingPKey;	//id
			thisSKey=rel.originatingSKey;	//code
			otherPKey=rel.finalPKey;		//geoWorldRegionID
			otherSKey=rel.finalSKey;		//code

		} else if (rel.finalEntity == entity.name) {
			otherCardinality = rel.originatingCardinality;
			entName=rel.originatingEntity;
			otherEnt = findEntity( cfg, entName );
			className=otherEnt.class;
			fldName=rel.originatingField;
			thisPKey=rel.finalPKey;
			thisSKey=rel.finalSKey;
			otherPKey=rel.originatingPKey;
			otherSKey=rel.originatingSKey;
		}
		//----> Set up parameters based on Cardinality 1 or M
		if (otherCardinality == '1') {
			relType = `${className}GType`;
			if (otherSKey === undefined) {
				funcName=`findById(parent.${thisPKey}, `;
				dataReturn="data";
			} else {
				funcName=`findByCompositeKey(null, "${otherPKey}", parent.${thisPKey}, "${otherSKey}", parent.${thisSKey}, `;
				dataReturn="data[0]";
			}


		} else if (otherCardinality == 'M') {
			relType = `new GraphQLList(${className}GType)`;
			if (otherSKey === undefined) {
				funcName=`findByKey("${idxName}", "${otherPKey}", parent.${thisPKey}, `;
				dataReturn="data";
			} else {
				funcName=`findByCompositeKey("${idxName}", "${otherPKey}", parent.${thisPKey}, "${otherSKey}", parent.${thisSKey}, `;
				dataReturn="data";
			}
			//console.log(`${entity.name}.${fldName}: type=${relType}`);
		}
		if (entity.name == "contactRelation") {
			console.log( `DEBUG CONTACT: \n\tfunName=${funcName}\n\trelType=${relType}\n\totherCardinality=${otherCardinality}\n\tidxName=${idxName}\n\totherPKey=${otherPKey}\n\totherSKey=${otherSKey}\n\tthisPKey=${thisPKey}\n\tthisSKey=${thisSKey}\n` );
		}


		//---- Start format ----
		tfields += `\t\t,${fldName}:{
				type: ${relType},
				resolve(parent,args){
					let ${entName} = new ${className}();
					return new Promise( (resolve, reject) => {
						${entName}.${funcName} (err, data) => {
							if (err != null) { 
								console.log("${fldName} resolver querying ${entName} object threw error:", JSON.stringify(err,null,2));
								reject( err ); 
							} else { 
								console.log("${fldName} resolver querying ${entName} object returned data:", JSON.stringify(data,null,2));
								resolve( ${dataReturn} ); 
							}
						});
					});
				}
			}\n`;
		//---- End format ----
	});


	//---- Format the model file text
	var om = 
`const ddbgoose = require('../ddbgoose');

const ${entity.name}Schema = {
	key: [ ${mkeys} ],
	fields: {
${mfields}	}
};
module.exports = ddbgoose.model(global.ddb_connection, '${entity.class}', '${entity.table}', ${entity.name}Schema);
`;

	//---- Format the schema Object Type
	let st = `
const ${entity.class}GType = new GraphQLObjectType({
	name: '${entity.class}',
	fields: ( ) => ({
${tfields}
	})
});`;

	//---- Format the Mutation functions for "add" method
	let smAdd = 
`		add${entity.class}: {
			type: ${entity.class}GType,
			args: {
${smaArgs}
			},
			resolve(parent,args) {
				let ${entity.name} = new ${entity.class}({
${smaFields}
				});
				return new Promise( (resolve, reject) => {
					${entity.name}.save( (err, data) => {
						if (err != null) { reject(err); } else { resolve( data ); }
					});
				});
			}
		}`;

	// ---- Format the Mutation functions for the "update" method
	let smUpdate =
`		update${entity.class}: {
			type: ${entity.class}GType,
			args: {
${smuArgs}
			},
			resolve(parentValue, args) {
				return new Promise( (resolve, reject) => {
					//const now = Date().toString();
					let ${entity.name} = new ${entity.class}();
					let keyObj = {};
					keyObj[ "${entity.pkey}" ] = args.${entity.pkey};
					if (${entity.name}.skey !== undefined) {
						keyObj[ "${entity.sortkey}" ] = args.${entity.sortkey};
					}
					${entity.name}.findOneAndUpdate( keyObj,
						{ ${smuFields} },
						(err, data) => {
							if (err != null) { reject(err); } else { resolve( data ); }
						}
					);
				});
			}
		}`;

	// ---- Format the Mutation functions for the "delete" method
	//gethere: debug this
	let smDelete =
`		delete${entity.class}ById: {
			type: ${entity.class}GType,
			args: {
${smdArgs}
			},
			resolve(parentValue, args) {
				return new Promise( (resolve, reject) => {
					let ${entity.name} = new ${entity.class}();
					let keyObj = {};

					keyObj[ ${entity.name}.pkey ] = args[ ${entity.name}.pkey ];
					if (${entity.name}.skey !== undefined) {
						keyObj[ ${entity.name}.skey ] = args[ ${entity.name}.skey ];
					}
					${entity.name}.findOneAndDelete( keyObj,
						(err, data) => {
							if (err != null) { reject(err); } else { resolve( data.Attributes ); }
						}
					);
				});
			}
		}`;

	//----> Generate the <ENTITY>ById(id) Query function
	let sq = [];
	sq.push(
`		${entity.name}ById: {
			type: ${entity.class}GType,
			args: {${entity.pkey}:{type: GraphQLID}},
			resolve(parent, args){
				let ${entity.name} = new ${entity.class}();
				return new Promise( (resolve, reject) => {
					${entity.name}.findById(args.${entity.pkey}, (err, data) => {
						if (err != null) {
							console.error("${entity.name} resolver querying object threw error:", JSON.stringify(err,null,2));
							reject( err );
						} else {
							resolve( data );
						}
					});
				});
			}
		}`);


	//----> Generate the <ENTITY>ByKeys(pkey, skey) Query Function
	if (entity.sortkey !== undefined) {
		sq.push(
`		${entity.name}ByKeys: {
			type: ${entity.class}GType,
			args: {${entity.pkey}:{type: GraphQLID}, ${entity.sortkey}:{type: GraphQLString}},
			resolve(parent, args){
				let ${entity.name} = new ${entity.class}();
				return new Promise( (resolve, reject) => {
					${entity.name}.findByCompositeKey(null, "${entity.pkey}", args.${entity.pkey}, "${entity.sortkey}", args.${entity.sortkey}, (err, data) => {
						if (err != null) {
							reject( err );
						} else {
							resolve( data[0] );
						}
					});
				});
			}
		}`);
	}

	return {'model': om, 'schemaType': st, 'schemaMutations': [smAdd, smUpdate, smDelete], 'schemaQueries': sq, 'types': oTypes };
}

//-------------------------------------------------
//-------------------------------------------------
function process() {
	let raw_config= fs.readFileSync(config_file);
	let cfg = JSON.parse(raw_config);
	let s_model = '';

	let model_requires = ''; // const Article = require('../models/article');
	let data_types = { 'GraphQLObjectType': 1, 'GraphQLSchema': 1, 'GraphQLNonNull':1, 'GraphQLList':1, 'GraphQLID':1 };
	let schema_types = [];
	let schema_mutations = [];
	let schema_queries = [];

	//---- Loop through the entities
	cfg.entities.forEach( (ent,idx) => {
		oEntity = gen_entity( cfg, ent);

		//---- Output the model file
		let filename = `${model_out_folder}${ent.name}${model_suffix}`;
		fs.writeFile(filename, oEntity.model, function (err) {
			if (err) return console.log(err);
			console.log(`    model file ${filename} written.`);
		});


		//---- Store the schema data away for later
		schema_types.push( oEntity.schemaType );
		for (let midx=0; midx < oEntity.schemaMutations.length; midx++) {
			schema_mutations.push( oEntity.schemaMutations[midx] );
		}
		for (let qidx=0; qidx < oEntity.schemaQueries.length; qidx++) {
			schema_queries.push( oEntity.schemaQueries[qidx] );
		}
	
		//---- Merge distinct data types
		Object.keys(oEntity.types).forEach( (tkey, tidx) => {
			let typ = oEntity.types[tkey];
			data_types[typ] = 1;
		});

		model_requires += `const ${ent.class} = require('${schema_model_folder}${ent.name}_ddb');\n`;

	} );


	//---- Generate the list of GraphQL data types
	let s_types = Object.keys(data_types).join(', ');

	//---- Generate the list of Schema Class types
	let s_schema_types = schema_types.join('\n\n');

	//---- Generate the list of schema mutation fields
	let s_schema_mutations = schema_mutations.join(',\n');

	//---- Generate the list of schema query fields
	let s_schema_queries = schema_queries.join(',\n');


	//--- Generate the schema file
	let s_schema = 
`const graphql = require('graphql');
${model_requires}

const { ${s_types}  } = graphql;

${s_schema_types}

const Mutation = new GraphQLObjectType({
	name: 'Mutations',
	fields: {
${s_schema_mutations}
	}
});

const RootQuery = new GraphQLObjectType({
	name: 'RootQueryGType',
	fields: {
		status: {
			type: GraphQLString,
			resolve(parent,args){
				return "Welcome to GraphQL"
			}
		},
${s_schema_queries}
	}
});

module.exports = new GraphQLSchema({
	query: RootQuery,
	mutation: Mutation
});

`;

	//---- Output the schema file
	fs.writeFile(schema_file, s_schema, function (err) {
		if (err) return console.log(err);
		console.log(`    model file ${schema_file} written.`);
	});

} // end function


//-------------------------------------------------
process();


