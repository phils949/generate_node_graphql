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
			this.skey = this.schema.key[1];		//optional


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

		//---> Set up the Dynamo transaction options
		const params = {
			TableName: this.table_name,
			Item: this.data,
			ReturnValues: "ALL_OLD"
		}

		//---> Call Dynamo to save this record
		this.ddb.db.put( params, function( err, data ) {
			if (err) {
				const errMsg = `Unable to add item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				console.error( errMsg );
				callback( errMsg, null);
			} else {
				var retVal = this.data;
				if (this.data.Attributes !== undefined) {
					retVal = this.data.Attributes;
				}
				//console.log( "Added item: ", JSON.stringify(retVal, null, 2));
				callback( null, retVal);
			}
		});
	}

	//-------------------------------------------------------------
	// Attach a .findOneAndUpdate( id_tuple, setData ) method
	//-------------------------------------------------------------
	mclass.prototype.findOneAndUpdate = function( id_tuple, setData, callback ) {


		// id_tuple = {id: "123"}
		// setData = {"$set": { id: "123", code: "abc", title: "abc 123 thing" }}

		//TODO: Replace console.logs below with actual logic!!!

		//console.log(`${this.name}.findOneAndUpdate() called.  setData: ${JSON.stringify(setData,null,2)}`);
		/*----
		if (setData != null) {
			Object.keys( setData ).forEach( (tkey, tidx) => {
				console.log(`\t${tkey} = ${setData[tkey]}`);
			});
		}
		-----*/

		//---> Set up the Dynamo transaction options
		var delim = ", ";
		var pcode_num = 97; // 97 = ASCII letter "a"
		var pcode = '';
		var updExpr = "set ";
		var expVal = {};
		Object.keys(setData).forEach( (fld,idx) => {

			if (fld != this.pkey && fld != this.skey) {

				//---> Reset the comma delimiter if this is the last item
				if (idx+1 == Object.keys(setData).length) { delim = ''; }
				//console.log(`idx=${idx}, fld=${fld}, delim="${delim}", len=${Object.keys(setData).length}`);

				pcode = ':' + String.fromCharCode( pcode_num + idx );
				updExpr += `${fld} = ${pcode}${delim}`;
				expVal[ pcode ] = setData[fld];
			}

		});


		//---> Set up the lookup keys
		var keyObj = {};
		keyObj[ this.pkey ] = id_tuple[ this.pkey ];
		if (this.skey !== undefined) {
			keyObj[ this.skey ] = id_tuple[ this.skey ];
		}

		//---> Finalize the request parameters
		const params = {
			TableName: this.table_name,
			Key: keyObj,
			UpdateExpression: updExpr,
			ExpressionAttributeValues: expVal,
			ReturnValues: "UPDATED_NEW"
		};

		//console.log(`put params: ${JSON.stringify(params,null,2)}`);

		//---> Call Dynamo to update this record
		this.ddb.db.update( params, function( err, data ) {
			if (err) {
				const errMsg = `Unable to update item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				//DEBUG: 
					console.error(errMsg);
				callback( errMsg, null );
			} else {
				var retVal = this.data;
				if (this.data.Attributes !== undefined) {
					retVal = this.data.Attributes;
				}
				//DEBUG:
					console.log( "Updated item: ", JSON.stringify(retVal, null, 2));
				callback( null, retVal);
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

		//---> Call Dynamo to query this record
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
	// Attach a .findByCompositeKey( idxName, pkeyName, pkeyValue, sortKeyName, sortKeyValue, callback ) method
	//-------------------------------------------------------------
	mclass.prototype.findByCompositeKey = function( idxName, pkeyName, pkeyValue, sortKeyName, sortKeyValue, callback ) {
		//DEBUG: console.log(`${this.name}.findByCompositeKey("${pkeyName}", "${pkeyValue}") called`);

		//---> Set up the Dynamo transaction options
		var attribs = {};
		attribs[":pkey_param"] = pkeyValue;
		attribs[":skey_param"] = sortKeyValue;
		const params = {
			TableName: this.table_name,
			KeyConditionExpression: `${pkeyName} = :pkey_param AND ${sortKeyName} = :skey_param`,
			ExpressionAttributeValues: attribs
		};
		var dynamicFunction;
		if (idxName != null) {
			params['IndexName'] = idxName;
			dynamicFunction = this.ddb.db.getItem;
		} else {
			dynamicFunction = this.ddb.db.query;
		}
		//console.log(JSON.stringify(params,null,2));
		//gethere: Should we use alternate functions (getItem vs. query)?

		//---> Call Dynamo to fetch matching records
		//dynamicFunction( params, function( err, data ) {
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

		//---> Call Dynamo to query this record
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
	// Attach a .query( args, callback )
	//	valid args keys:
	//		idxName - optional
	//		andPairs - array of dictionaries, each of which contain "name", "comparison", "value".
	//				each expression will be AND'ed together in a filter expression
	//				valid comparison values include: eq, ne, gt, ge, lt, le, contains, ncontains
	//		orPairs - array of dictionaries, each of which contain "name", "comparison", "value"
	//				each expression will be OR'ed together in a filter expression
	//				valid comparison values include: eq, ne, gt, ge, lt, le, contains, ncontains
	//-------------------------------------------------------------
	//gethere: WIP
	mclass.prototype.query = function( idxName, pkeyName, pkeyValue, sortKeyName, sortKeyValue, callback ) {
		//DEBUG: console.log(`${this.name}.findByCompositeKey("${pkeyName}", "${pkeyValue}") called`);

		//---> Set up the Dynamo transaction options
		var attribs = {};
		attribs[":pkey_param"] = pkeyValue;
		attribs[":skey_param"] = sortKeyValue;
		const params = {
			TableName: this.table_name,
			KeyConditionExpression: `${pkeyName} = :pkey_param AND ${sortKeyName} = :skey_param`,
			ExpressionAttributeValues: attribs
		};
		var dynamicFunction;
		if (idxName != null) {
			params['IndexName'] = idxName;
			dynamicFunction = this.ddb.db.getItem;
		} else {
			dynamicFunction = this.ddb.db.query;
		}
		//console.log(JSON.stringify(params,null,2));
		//gethere: Should we use alternate functions (getItem vs. query)?

		//---> Call Dynamo to fetch matching records
		//dynamicFunction( params, function( err, data ) {
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
	mclass.prototype.findOneAndDelete = function( id_tuple, callback ) {
		//console.log(`${this.name}.findOneAndDelete("${JSON.stringify(id_tuple)}") called`);

		//---> Set up the lookup keys
		var keyObj = {};
		keyObj[ this.pkey ] = id_tuple[ this.pkey ];
		if (this.skey !== undefined) {
			keyObj[ this.skey ] = id_tuple[ this.skey ];
		}

		const params = {
			TableName: this.table_name,
			Key: keyObj,
			ReturnValues: "ALL_OLD"
		};

/*
			ConditionExpression: `${this.pkey} = :keyVal`,
			ExpressionAttributeValues: {
				":keyVal": id 
			}
*/
		//console.log(`delete params: ${JSON.stringify(params,null,2)}`);


		//---> Call Dynamo to update this record
		this.ddb.db.delete( params, function( err, data ) {
			if (err) {
				const errMsg = `Unable to delete item. Error JSON: ${JSON.stringify(err, null, 2)}`;
				//DEBUG: 
					console.error(errMsg);
				callback( errMsg, null );
			} else {
				//DEBUG:
					//console.log( "Deleted item: ", JSON.stringify(data, null, 2));
				callback( null, data );
			}
		});
	}





	return mclass;
}



exports.client = client;
exports.ddb = ddb;
exports.model = model;
