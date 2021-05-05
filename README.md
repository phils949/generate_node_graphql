# Overview

The "gql" sample app is a GraphQL service that demonstrates the use of a code-generator to 
translate a JSON schema into GraphQL server-side code (without any coding).

It originally used Mongoose as a library to leverage MongoDB as a backing datastore.
An alternate version is also being built to support AWS DynamoDB as a backing datastore.

## Configuring the service

Settings for the service are created in a ".env" file in the root app folder.
The .env file format is a series of NAME=VALUE lines. For both the MongoDB and AWS DDB
versions of the app, a SERVER_PORT=#### value must be set.

Example MongoDB version of .env file where mongo runs on 192.168.0.61:27017 host/port:

	SERVER_PORT=8081
	MONGODB_URL=mongodb://192.168.0.61:27017/mycollection?retryWrites=true&w=majority&gssapiServiceName=mongodb

Example AWS DDB version of .env file:

	SERVER_PORT=8081
	AWS_REGION=us-east-1
	AWS_ACCESS_KEY_ID=AAAABBBB44444ZZZZYYY
	AWS_SECRET_ACCESS_KEY=aaabbb5555zzzz888aaa022fffffff22222zzzz
	DROP_SCHEMA=Y

## How To Define a Schema

Edit the ./schema/schema.json file to define the entities and their relationships.

The top level keys in the JSON object are:
	entities:	an array of entity definitions, including fields and keys
	relations:	an array of relationship definitions that bind entities together

Example outer JSON structure:

	{
		"entities": [ <entity1>, ...<entityN> ],
		"relations": [ <relation1>, ...<relationN> ]
	}



An example entity object (listed in the "entities" array);:

	{
		"name": "article",
		"class": "Article",
		"pkey": "id",
		"fields": [
			{"name": "title", "type": "String", "isNull": false},
			{"name": "topic", "type": "String", "isNull": false},
			{"name": "date", "type": "String", "isNull": false},
			{"name": "contributorId", "type": "String", "isNull": false}
		]
	}	

An example relation (as Contributor(One) -> Article(Many)):

	{
		"name": "contributorArticles",
		"originatingCardinality": "1",
		"originatingEntity": "contributor",
		"originatingClass": "Contributor",
		"originatingField": "contributor",
		"originatingKey": "id",
		"finalCardinality": "M",
		"finalEntity": "article",
		"finalClass": "Article",
		"finalField": "articles",
		"finalKey": "contributorId"
	}

A note about cardinality.  The cardinality attributes support "1" or "M" for one or many.
The supported combinations between the Originating and Final entities are:
	1-1	(one to one)
	1-M	(one to many)
	M-1	(many to one)

The Many-to-Many relation is not supported, as it would require generation of a hidden 
intersection table and entity.  If you must implement a many-to-many relation, you will
need to create your own intermediate intersetion entity to map TABLE1 (1:M) INTERSECTION (M:1) TABLE2.

## How to create DynamoDB tables and indexes automatically

Once the schema/schema_ddb.json file has been created, you can run the following utility script to create DynamoDB tables and indexes.

	node gen_ddb_database.js

This will look at the ".env" file setting called "DROP_SCHEMA=Y|N" to determine whether or not the script will attempt to drop tables before recreating them.  If "N", it will only create tables that do not already exist.  If "Y", it will drop each table, wait until the table is dropped, and then re-create the tables.


## How to load seed data into DynamoDB tables automatically

In the schema/schema_ddb.json file, within each Entity definition, an optional attribute named "seedFile" can specify a json datq file (that should live within the schema/ folder) to be loaded into the DynamoDB table.

The format of a seed file is:

	{
		Items: [
			{ "id": "111", "field1": "value1.1", "field2": "value2.1" },
			{ "id": "222", "field1": "value1.2", "field2": "value2.2" },
			{ "id": "333", "field1": "value1.3", "field2": "value2.3" },
			{ "id": "333", "field1": "value1.4", "field2": "value2.4" }
		]
	}

Once the schema/schema_ddb.json file has one or more seed files defined for entities, run the loader script as follows:
	node load_seed_data_dynamo.js

## How to run the code generator (to Generate the Schema/Model Code for a GraphQL Server)

After having defined the schema structure in the ./schema/schema.json file,
run the appropriate code generator:

For MongoDB backed service:
	node gen_data.js

For AWS DynamoDB backed service:
	node gen_dynamo.js

This will read the schema.json file and generate *.js files in the ./schema/ and ./models/
folders.  However, in order to ensure that original source code does not get overwritten,
it outputs files with the extension *.js_out.  Each such file must be manually renamed or copied
to replace the *.js files, before attempting to run the index.js service.


## How to run the GraphQL Service:
There are two versions of the main service app, one each for MongoDB and AWS DynamoDB.

To run the MongoDB backed service, the "index.js" file is the main server, which can be run by typing:
	nodemon index.js
		or
	node index.js

To run the AWS DynamoDB backed service, the "index_dynamo.js" file is the main server, which can be run by typing:
	nodemon index_dynamo.js
		or
	node index_dynamo.js

In my environment, my app is running in a docker instance that binds the GraphQL service to
port number 5000. But, the docker container is running nginx reverse proxy that maps
inbound requests on port 8081 at endpoint "/gql" to back-end service running on port 5000.
So, from the host machine browser, I open:
	http://localhost:8081/gql

If you are running the service on the same machine where your web browser lives, you can
open the browser with the port number in your .env file, as follows:

	http://localhost:5000/graphql

## If using MongoDB, to see the data on the mongo service...

In my development environment, I use a docker container to host my MongoDB instance. So,
I connect to my mongodb instance using a docker utility script like this:

	_utils/connect.sh pen-mongo
	mongo
	> use sandbox
	> db.getCollection("contributors").find()
	> db.getCollection("articles").find()
	> quit()
	exit

## Directory Structure and files:

Main folder name is "gql".  Subfolders/files:
	/
		README.md
		gen_data.js
		gen_dynamo.js
		index.js
		index_dynamo.js
		package-lock.json
		package.json
		models/
			*.js		Live model code, used by index.js.  (copied from *_out.js files)
			*_out.js	Model code generated by gen_data.js script.  Must be copied to .js
		node_modules/		Folder where node/npm install node modules.
		schema/			Folder containing schema config and schema code modules.
			schema.js	Live schema node module used by index.js.  (copied from schema_out.js)
			schema_out.js	Schema code generated by gen_data.js script. Must be copied to .js
			schema.json	The config file, edited to define the data structures, and read by gen_data.js.


## Notes on converting from MongoDB to DynamoDB

	schema/schema.js (generated output module)
		There is no direct reference to Mongoose here.
		But, some resolvers pass parameters that use Mongo JSON structure to query or update data.
		Need to first attack the Models to make them DynamoDB integrated. Then, adjust the resolver parameters.


	model/*.js (generated output module)

		Mongoose make it way too easy, and I can't find an ORM like it that does the same for
		DynamoDB. So, do I create a Dynamo equivelant ORM for Mongoose?
		The model code is very simple.  Here's an example:

			const mongoose = require('mongoose');
			const Schema = mongoose.Schema

			const articleSchema = new Schema({
			    name: String,
			    topic: String,
			    date: String,
			    contributorId:String
			})
			module.exports = mongoose.model('Article',articleSchema);

		I need to create an alternate gen_data.js generator that produces Dynamo models (and schema resolvers).

## Long term objectives:

1.	Each service can host multiple entities within a domain.
2.	Multiple domain-based (multi-entity) services should federate to a master
		service/schema.
3.	Need to compare our GraphQL Schema output with the federated apollo 
		sample project.
4.	Need a way for each domain service to perform cross-domain decoratino/extension.




