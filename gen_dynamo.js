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
	let found = null;
	cfg.relations.forEach( (rel, idx) => {
		if ( rel.originatingEntity == entityName || rel.finalEntity == entityName ) {
			found = rel;
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
	var mkeys = `"${entity.pkey}"`;	//TODO: limitation of 1 key. Consider supporint muliple kyes.
	var smaArgs = '';
	var smaFields= '';
	var tfields = '		id: { type: GraphQLID },\n';
	var smuArgs = `\t\t\t\t${entity.pkey}: {type: new GraphQLNonNull(GraphQLString)}${delim}\n`;
	var smuFields = '';
	var oTypes = {};
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

	//---- Extend schema Object Type fields for relations
	let rel = findRelation( cfg, entity.name );
	if (rel !== null) {

		//----> Set up parameters based on Originating or Final
		var funcName, entName, className, fldName, keyName, relType, idxName;
		idxName = rel.altIndex;
		if (rel.originatingEntity == entity.name) {
			otherCardinality = rel.finalCardinality;
			entName=rel.finalEntity;	//geoCountry
			className=rel.finalClass;	//GeoCountry
			fldName=rel.finalField;		//geoCountries
			otherKey=rel.finalKey;		//geoWorldRegionID
			thisKey=rel.originatingKey;	//id
		} else if (rel.finalEntity == entity.name) {
			otherCardinality = rel.originatingCardinality;
			entName=rel.originatingEntity;
			className=rel.originatingClass;
			fldName=rel.originatingField;
			otherKey=rel.originatingKey;
			thisKey=rel.finalKey;
		}
		//----> Set up parameters based on Cardinality 1 or M
		if (otherCardinality == '1') {
			funcName=`findById(parent.${thisKey}, `;
			relType = `${className}Type`;
		} else if (otherCardinality == 'M') {
			funcName=`findByKey("${idxName}", "${otherKey}", parent.${thisKey}, `;
			relType = `new GraphQLList(${className}Type)`;
			console.log(`${entity.name}.${fldName}: type=${relType}`);
		}

		//---- Start format ----
		tfields += `\t\t,${fldName}:{
				type: ${relType},
				resolve(parent,args){
					let ${entName} = new ${className}();
					return new Promise( (resolve, reject) => {
						${entName}.${funcName} (err, data) => {
							if (err != null) { reject( err ); } else { resolve( data ); }
						});
					});
				}
			}`;
		//---- End format ----
	}


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
const ${entity.class}Type = new GraphQLObjectType({
	name: '${entity.class}',
	fields: ( ) => ({
${tfields}
	})
});`;

	//---- Format the Mutation functions for "add" method
	let smAdd = 
`		add${entity.class}: {
			type: ${entity.class}Type,
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
	//gethere: debug this

	let smUpdate =
`		update${entity.class}: {
			type: ${entity.class}Type,
			args: {
${smuArgs}
			},
			resolve(parentValue, args) {
				return new Promise( (resolve, reject) => {
					//const now = Date().toString();
					let ${entity.name} = new ${entity.class}();
					${entity.name}.findOneAndUpdate(
						{${entity.pkey}: args.${entity.pkey}},
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
`		delete${entity.class}: {
			type: ${entity.class}Type,
			args: {id:{type: GraphQLID}},
			resolve(parentValue, args) {
				return new Promise( (resolve, reject) => {
					let ${entity.name} = new ${entity.class}();
					${entity.name}.deleteById( 
						${entity.pkey},
						(err, data) => {
							if (err != null) { reject(err); } else { resolve( data ); }
						}
					);
				});
			}
		}`;

	//---- Format the Query functions
	let sq = 
`		${entity.name}: {
			type: ${entity.class}Type,
			args: {id:{type: GraphQLID}},
			resolve(parent, args){
				let ${entity.name} = new ${entity.class}();
				return new Promise( (resolve, reject) => {
					${entity.name}.findById(args.id, (err, data) => {
						if (err != null) {
							reject( err );
						} else {
							resolve( data );
						}
					});
				});
			}
		}`;

	return {'model': om, 'schemaType': st, 'schemaMutations': [smAdd, smUpdate, smDelete], 'schemaQueries': [sq], 'types': oTypes };
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
	name: 'RootQueryType',
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


