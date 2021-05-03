require('dotenv').config();
const fs = require('fs');
const config_file = './schema/schema_ddb.json';
const data_folder = './schema/';
var AWS = require("aws-sdk");

AWS.config.update({
	region: process.env.AWS_REGION
});
//var docCli = new AWS.DynamoDB.DocumentClient();
var dynamodb = new AWS.DynamoDB();


cfg = load_json( config_file );
process_data( cfg, data_folder, dynamodb );

//-------------------------------------------------
function load_json( json_file ) {
	let raw_json = fs.readFileSync(json_file);
	return JSON.parse( raw_json );
}


//-------------------------------------------------
async function process_data( cfg, data_folder, db ) {

	const typeMap = {
		"String": "S",
		"Int": "N",
		"Float": "N",
		"Double": "N",
		"ID": "S",
		"Bin": "B",
		"Binary": "B",
		"Boolean": "N",
		"Bool": "N"
	};

	//--- Loop through each Entity
	cfg.entities.forEach( (ent,idx) => {

		if (ent.table != "GeoCountry") return;

		//--- Prepare the basic table request object
		var params = {
			TableName: ent.table,
			BillingMode: "PAY_PER_REQUEST",
			KeySchema: [
				{ AttributeName: ent.pkey, KeyType: "HASH"},
			],
			AttributeDefinitions: [
			],
		}

		//----> Add a sort key to the primary index
		if (ent.sortkey !== undefined) {
			params.KeySchema.push( { AttributeName: ent.sortkey, KeyType: "RANGE" } );
		}

		//----> Process each field definition
		ent.fields.forEach( (fld,fidx) => {
			params.AttributeDefinitions.push( 
				{ "AttributeName": fld.name, "AttributeType": typeMap[ fld.type ] }
				);
		});


		//----> Process secondary indexes
		if (ent.indexes !== undefined) {

			ent.indexes.forEach( (sec, sidx) => {

				if (sec.type == "GSI") {
					if (params.GlobalSecondaryIndexes === undefined) {
						params.GlobalSecondaryIndexes = [];
					}
					var projType = "ALL";
					if (sec.scope == "keys") projType = "KEYS_ONLY";
					if (sec.scope == "include") {
						projType = "INCLUDE";
						
					}
					var ks = [ {AttributeName: sec.pkey, KeyType: "HASH" } ];
					if (sec.sortkey !== undefined) {
						ks.push( {AttributeName: sec.sortkey, KeyType: "RANGE" } );
					}
					var gsi = {
						"IndexName": sec.name,  
						"KeySchema": ks,
						"Projection": { "ProjectionType": projType }
						};
					if (sec.scope == "include") {
						gsi.Projection[ "NonKeyAttributes" ] = sec.projectFields;
						// NOTE: Projected Fields is an array of string fieldnames only (non-key)
					}
					params.GlobalSecondaryIndexes.push( gsi );
				} else if (sec.type == "LSI") {
					if (params.LocalSecondaryIndexes === undefined) {
						params.LocalSecondaryIndexes = [];
					}
					var projType = "ALL";
					if (sec.scope == "keys") projType = "KEYS_ONLY";
					if (sec.scope == "include") {
						projType = "INCLUDE";
					}
					var ks = [ {AttributeName: sec.pkey, KeyType: "HASH" } ];
					if (sec.sortkey !== undefined) {
						ks.push( {AttributeName: sec.sortkey, KeyType: "RANGE" } );
					}
					var lsi = {
						"IndexName": sec.name,  
						"KeySchema": ks,
						"Projection": { "ProjectionType": projType }
						};
					if (sec.scope == "include") {
						lsi.Projection[ "NonKeyAttributes" ] = sec.projectFields;
						// NOTE: Projected Fields is an array of string fieldnames only (non-key)
					}
					params.LocalSecondaryIndexes.push( lsi );
				}
			});
		}

		//----> 
		//console.log(JSON.stringify( params, null, 2 ));

		//--- Delete the table
		if (process.env.DROP_SCHEMA == "Y") {
			dynamodb.deleteTable( { TableName: ent.table }, function(err, data) {
				

				//--- Create the table
				dynamodb.createTable(params, function(err, data) {
					if (err) {
						console.error("Unable to create table. Error JSON:", JSON.stringify(err, null, 2), "\n\n", JSON.stringify(params, null, 2));
					} else {
						console.log("Created table. Table description JSON:", JSON.stringify(data, null, 2));
					}
				});
	

			} );
		} else {

				//--- Create the table
				dynamodb.createTable(params, function(err, data) {
					if (err) {
						console.error("Unable to create table. Error JSON:", JSON.stringify(err, null, 2), "\n\n", JSON.stringify(params, null, 2));
					} else {
						console.log("Created table. Table description JSON:", JSON.stringify(data, null, 2));
					}
				});

		}


	});
};

