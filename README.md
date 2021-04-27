<<<<<<< HEAD
# Overview

The "gql" sample app is a GraphQL service that demonstrates the use of a code-generator to 
translate a JSON schema into GraphQL code (without any coding).

It originally used Mongoose as a library to leverage MongoDB as a backing datastore.
This version of the app is being ported to AWS DynamoDB instead of MongoDB



## How To Define a Schema

Edit the ./schema/schema.json file to define the entities and their relationships.



## How to run the code generator (to Generate the Schema/Model Code)

After having defined the schema structure in the ./schema/schema.json file,
run the code generator as follows:
	node gen_data.js
This will read the schema.json file and generate *.js files in the ./schema/ and ./models/
folders.  However, in order to ensure that original source code does not get overwritten,
it outputs files with the extension *.js_out.  Each such file must be manually renamed or copied
to replace the *.js files, before attempting to run the index.js service.


## How to run the GraphQL Service:
The "index.js" file is the main server, which can be run by typing:
	nodemon index.js
		or
	node index.js

From the host machine browser, open:
	http://localhost:8081/gql


## If using MongoDB, to see the data on the mongo service...

Connect to the mongo container and query mongo as follows:
	./pensive/_utils/connect.sh pen-mongo
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
		index.js
		package-lock.json
		package.json
		sav_env
		models/
			*.js		Live model code, used by index.js.  (copied from *_out.js files)
			*_out.js	Model code generated by gen_data.js script.  Must be copied to .js
		node_modules/		Folder where node/npm install node modules.
		schema/			Folder containing schema config and schema code modules.
			schema.js	Live schema node module used by index.js.  (copied from schema_out.js)
			schema_out.js	Schema code generated by gen_data.js script. Must be copied to .js
			schema.json	The config file, edited to define the data structures, and read by gen_data.js.
			update.js	???


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




=======
# generate_node_graphql
A code generator that creates a Node.js service using Apollo, to convert a schema json config file into a fully functioning GraphQL service with database resolvers.
>>>>>>> 97b4b42915b84ffa8efcc7ee17034b870674f74c