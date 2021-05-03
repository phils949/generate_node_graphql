//--- Load config info from .env file into process.env.VARIABLE_NAME_HERE
require('dotenv').config()
console.log( Object.keys( process.env ) );


const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const ddbgoose = require('./ddbgoose');


//----> Instantiate Express web server object
const app = express();

//---> Connect to database
console.log("Connecting to AWS DynamoDB...")
global.ddb_connection = new ddbgoose.ddb();   //NOTE: ddb_connection is a global referenced by Models by name
ddb_connection.connect( process.env.AWS_REGION );
console.log("Connected to AWS DynamoDB.")


//--- Load the code-generated schema.js module
const schema = require('./schema/schema_ddb');



//---> Map a /graphql/ endpoint to the Express web server
app.use(
	"/graphql",
	graphqlHTTP({
		schema: schema,
		graphiql: true,
    }));  


//---> Launch the Express web server
const port = process.env.SERVER_PORT;
app.listen(port, () => {
    console.log(`now listening for requests on port ${port}`);
	});


