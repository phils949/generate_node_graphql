require('dotenv').config();
const fs = require('fs');
const config_file = './schema/schema_ddb.json';
const data_folder = './schema/';
var AWS = require("aws-sdk");

AWS.config.update({
	region: process.env.AWS_REGION
});
var docCli = new AWS.DynamoDB.DocumentClient();


cfg = load_json( config_file );
process_data( cfg, data_folder, docCli );

//-------------------------------------------------
function load_json( json_file ) {
	let raw_json = fs.readFileSync(json_file);
	return JSON.parse( raw_json );
}


//-------------------------------------------------
async function process_data( cfg, data_folder, docCli ) {

	cfg.entities.forEach( (ent,idx) => {
		if (ent.seedFile === undefined) {
			return;
		}
		console.log(`Loading seed JSON data from seedFile: ${ent.seedFile}`);
		let data = load_json( data_folder + ent.seedFile );
		console.log('...JSON loaded');
		data.Items.forEach( (recordObj, idx2) => {
			let params = {
				TableName: ent.table,
				Item: recordObj
			};

			docCli.put(params, function(err, data) {
    				if (err) {
        				console.error(`Unable to add ${ent.table} item. Error JSON: ${JSON.stringify(err, null, 2)}`);
    				}
			});
		});
		
		console.log('...data writes submitted.');
	});
};

