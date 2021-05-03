const AWS = require("aws-sdk");
const modelDbSymbol = Symbol('ddbgoose#Model#db');

function client () {
	return new ddb();
}

class ddb {
	constructor( ) {
		this.easterEgg = "";
	}

	connect( aws_region ) {
		AWS.config.update({
			region: process.env.AWS_REGION
		});

		this.db = new AWS.DynamoDB.DocumentClient();
		this.easterEgg = "Happy Easter!";
	}
}

//--------------------------------------------------------------------------------------------------------
//---- model is a class factory that returns a Model class based on the schema and database connection
//--------------------------------------------------------------------------------------------------------
function model ( ddb, name, table_name, schema ) {

	//--- Generate the basic class with its constructor
	let mclass = class {
		constructor( data_obj ) {
			this.data = data_obj;

			//--- Embed magic data into the class (not passed in during Model instantiation!)
			this.ddb = ddb;
			this.name = name;
			this.table_name = table_name; 
			this.schema = schema;
			this.pkey = this.schema.key[0];


			//---> Verify database connection
			if (this.ddb === undefined) {
				this.ddb = global.ddb_connection;
				console.log('...had to directly set global.ddb_connection in Constructor');
				console.log(`this.name="${this.name}", this.table_name="${this.table_name}"`);
			}


		}
	}

	//-------------------------------------------------------------
	// Attach a .save() method
	//-------------------------------------------------------------
	mclass.prototype.save = function( callback ) {

		/*-----
		console.log(`${this.name}.save() called.  Data:`);
		if (this.data !== null) {
			Object.keys( this.data ).forEach( (tkey, tidx) => {
				console.log(`\t${tkey} = ${this.data[tkey]}`);
			});
		}
		console.log(`\n\nDB connection message: ${this.ddb.easterEgg}`);
		------*/


		//---> Set up the Dynamo transaction options
		const params = {
			TableName: this.table_name,
			Item: this.data
		}

		//---> Call Dynamo to save this record
		this.ddb.db.put( params, function( err, data ) {
			if (err) {
				//TODO: remove this logging for production
				const errMsg = `Unable to add item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				console.error( errMsg );
				callback( null, data );
			} else {
				//TODO: remove this logging for production
				console.log( "Added item: ", JSON.stringify(this.data, null, 2));
				callback( null, this.data);
			}
		});
	}

	//-------------------------------------------------------------
	// Attach a .findOneAndUpdate( id, setData ) method
	//-------------------------------------------------------------
	mclass.prototype.findOneAndUpdate = function( id_tuple, setData, callback ) {


		// id_tuple = {id: "123"}
		// setData = {"$set": { id: "123", code: "abc", title: "abc 123 thing" }}

		//TODO: Replace console.logs below with actual logic!!!

		console.log(`${this.name}.findOneAndUpdate() called.  Data: ${JSON.stringify(setData,null,2)}`);
		if (setData !== null) {
			Object.keys( setData ).forEach( (tkey, tidx) => {
				console.log(`\t${tkey} = ${this.data[tkey]}`);
			});
		}
		console.log(`\n\nDB connection message: ${this.ddb.easterEgg}`);

		//---> Set up the Dynamo transaction options
		const keyName = Object.keys(id_tuple)[0];
		const keyValue = id_tuple[keyName];
		var delim = ", ";
		var pcode_num = 97; // 97 = ASCII letter "a"
		var pcode = '';
		var updExpr = "set ";
		var expVal = {};
		console.log('hello 9');
		Object.keys(setData).forEach( (fld,idx) => {

			//---> Reset the comma delimiter if this is the last item
			if (idx+1 == Object.keys(setData).length) { delim = ''; }

			pcode = ':' + String.fromCharCode( pcode_num + idx );
			updExpr += `${fld} = ${pcode}{$delim}`;
			expVal[ pcode ] = setData[fld];

		});

		console.log('hello 10');


		const params = {
			TableName: this.table_name,
			Key: { keyName, keyValue },
			UpdateExpression: updExpr,
			ExpressionAttributeValues: expVal,
			ReturnValues: "UPDATED_NEW"
		};

		console.log(`put params: ${JSON.stringify(params,null,2)}`);

		//---> Call Dynamo to update this record
		this.ddb.db.update( params, function( err, data ) {
			if (err) {
				const errMsg = `Unable to add item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				//DEBUG: 
					console.error(errMsg);
				callback( errMsg, null );
			} else {
				//DEBUG:
					console.log( "Added item: ", JSON.stringify(data, null, 2));
				callback( null, data );
			}
		});
	}

	//-------------------------------------------------------------
	// Attach a .findById(id) method
	//-------------------------------------------------------------
	mclass.prototype.findById = function( id, callback ) {
		//DEBUG: console.log(`${this.name}.findById(${id}) called`);

		const keyName = this.pkey;

		//---> Set up the Dynamo transaction options
		const params = {
			TableName: this.table_name,
			KeyConditionExpression: `${keyName} = :key_param`,
			ExpressionAttributeValues: { ":key_param": id }
		};

		//---> Call Dynamo to update this record
		this.ddb.db.query( params, function( err, data ) {
			if (err) {
				const errMsg = `Unable to fetch item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				//debug: console.error(errMsg);
				callback( errMsg, null );

			} else {
				//DEBUG: console.log( "Item fetched: ", JSON.stringify(data.Items[0], null, 2));
				callback( null, data.Items[0] );
			}
		});
	}

	//-------------------------------------------------------------
	// Attach a .findByKey( idxName, keyName, value, callback ) method
	//-------------------------------------------------------------
	mclass.prototype.findByKey = function( idxName, keyName, value, callback ) {
		//DEBUG: console.log(`${this.name}.findByKey("${keyName}", "${value}") called`);

		//---> Set up the Dynamo transaction options
		const params = {
			TableName: this.table_name,
			IndexName: idxName,
			KeyConditionExpression: `${keyName} = :key_param`,
			ExpressionAttributeValues: { ":key_param": value }
		};
		console.log(JSON.stringify(params,null,2));

		//---> Call Dynamo to update this record
		this.ddb.db.query( params, function( err, data ) {
			if (err) {
				const errMsg = `Unable to fetch item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				//DEBUG: console.error( errMsg );
				callback( errMsg, null );
			} else {
				//DEBUG: console.log( "Item fetched: ", JSON.stringify(data, null, 2));
				callback( null, data.Items );
			}
		});
	}


	//-------------------------------------------------------------
	// Attach a .deleteById( keyName, value ) method
	//-------------------------------------------------------------
	mclass.prototype.deleteById = function( id, callback ) {
		console.log(`${this.name}.deleteById("${id}") called`);



		//gethere
		//TODO: Replace console.log with actual logic!!!
	}



	return mclass;
}



exports.client = client;
exports.ddb = ddb;
exports.model = model;
