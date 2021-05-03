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
function table_exists( table_name, db, callback ) {
	var status = false;
	var params = {
		TableName: table_name /* required */
		};
	db.describeTable(params, function(err, data) {
		if (err) {
			status = false;
		} else {
			status = true;
		}
		callback(status);
	});
}

//-------------------------------------------------
async function ms_sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}   

//-------------------------------------------------
async function table_not_exists_wait( table_name, db, callback ) {
	var doesExist = true;
	while (doesExist) {
		table_exists( table_name, db, (status) => {
			doesExist = status;
		});
		if (doesExist) {
			await ms_sleep(1000);
			//console.error(`Waiting for "${table_name}" to not exist...`);
		}
	}	
	callback();
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

		//if (ent.table != "GeoCountry") return;

		var keyAttribs = {};

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
		keyAttribs[ ent.pkey ] = 1;

		//----> Add a sort key to the primary index
		if (ent.sortkey !== undefined) {
			params.KeySchema.push( { AttributeName: ent.sortkey, KeyType: "RANGE" } );
			keyAttribs[ ent.sortkey ] = 1;
		}

		//----> Process secondary indexes
		if (ent.indexes !== undefined) {

			ent.indexes.forEach( (sec, sidx) => {

				var projType = "ALL";
				if (sec.scope == "keys") projType = "KEYS_ONLY";
				if (sec.scope == "include") {
					projType = "INCLUDE";
				}
				var ks = [ {AttributeName: sec.pkey, KeyType: "HASH" } ];
				keyAttribs[ sec.pkey ] = 1;
				if (sec.sortkey !== undefined) {
					ks.push( {AttributeName: sec.sortkey, KeyType: "RANGE" } );
					keyAttribs[ sec.sortkey ] = 1;
				}
				var si = {
					"IndexName": sec.name,  
					"KeySchema": ks,
					"Projection": { "ProjectionType": projType }
					};
				if (sec.scope == "include") {
					si.Projection[ "NonKeyAttributes" ] = sec.projectFields;
					// NOTE: Projected Fields is an array of string fieldnames only (non-key)
				}

				//---- Push the Secondary Index (si) into the correct index-type array
				if (sec.type == "GSI") {
					if (params.GlobalSecondaryIndexes === undefined) {
						params.GlobalSecondaryIndexes = [];
					}
					params.GlobalSecondaryIndexes.push( si );
				} else if (sec.type == "LSI") {
					if (params.LocalSecondaryIndexes === undefined) {
						params.LocalSecondaryIndexes = [];
					}
					params.LocalSecondaryIndexes.push( si );
				}
			});
		}

		//----> Process each field definition
		ent.fields.forEach( (fld,fidx) => {
			if ( keyAttribs[ fld.name ] !== undefined ) {
				params.AttributeDefinitions.push( 
					{ "AttributeName": fld.name, "AttributeType": typeMap[ fld.type ] }
					);
			}
		});


		//----> DEBUG: Dump the params for this table creation
		//console.log(JSON.stringify( params, null, 2 ));

		//--- Delete the table
		if (process.env.DROP_SCHEMA == "Y") {
			console.log(`Attempting to drop table: ${ent.table}...`);
			table_exists( ent.table, dynamodb, (isExists) => {

				//---> If the table exists, then Delete it, wait for deletion, then create it
				if (isExists) {
					dynamodb.deleteTable( { TableName: ent.table }, function(err, data) {
						if (err) {
							console.error("Unable to drop table. Error JSON:", JSON.stringify(err, null, 2));
						} else {
							//console.log(`Successfully dropped table: ${ent.table}...\nDrop response: ${JSON.stringify(data,null,2)}`);
							console.log(`Successfully dropped table: ${ent.table}`);
						}

						//---> Wait until the table is gone
						table_not_exists_wait( ent.table, dynamodb, () => {

							//--- Create the table
							dynamodb.createTable(params, function(err, data) {
								if (err) {
									console.error(`Unable to create table "${ent.table}". Error JSON:`, JSON.stringify(err, null, 2), "\n\n", JSON.stringify(params, null, 2));
								} else {
									//console.log(`Created table "${ent.table}". Table description JSON:`, JSON.stringify(data, null, 2));
									console.log(`Created table "${ent.table}".`);
								}
							});		// end: dynamodb.createTable
						});		// end: table_not_exists_wait...
					});		// end: dynamodb.deleteTable...

				//---> If the table already doesn't exist, just create it.
				} else {

					//--- Create the table
					dynamodb.createTable(params, function(err, data) {
						if (err) {
							console.error(`Unable to create table "${ent.table}". Error JSON:`, JSON.stringify(err, null, 2), "\n\n", JSON.stringify(params, null, 2));
						} else {
							//console.log(`Created table "${ent.table}". Table description JSON:`, JSON.stringify(data, null, 2));
							console.log(`Created table "${ent.table}".`);
						}
					});
				}		// end: if (isExists)...else...
			});		// end: table_exists...

		//--- Do not delete the table.  Only create it if it does not exist...
		} else {
			table_exists( ent.table, dynamodb, (isExists) => {
				if (isExists) {
					console.log(`Table "${ent.table}" already exists.  Skipping creation.`);
				} else {

					//--- Create the table
					dynamodb.createTable(params, function(err, data) {
						if (err) {
							console.error("Unable to create table. Error JSON:", JSON.stringify(err, null, 2), "\n\n", JSON.stringify(params, null, 2));
						} else {
							//console.log("Created table. Table description JSON:", JSON.stringify(data, null, 2));
							console.log(`Created table "${ent.table}".`);
						}
					});		// end: dynamodb.createTable...
				}		// end: if(isExists)...else...
			});		// end: table_exists...
		}		// end: if (process.env.DROP_SCHEMA == "Y")...else...
	});		// end: cfg.entities.forEach...
};

