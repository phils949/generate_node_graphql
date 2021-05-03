const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const schema = require('./schema/schema');

//TODO: Replace Mongoose with DynamoDB
const mongoose = require('mongoose');
require('dotenv').config()

const app = express();

//TODO: Replace Mongoose with DynamoDB
console.log("Connecting to MongoDB...")
mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.connection.once('open', ()=>{
	console.log("Connected to MongoDB")
	});

app.use(
	"/graphql",
	graphqlHTTP({
		schema: schema,
		graphiql: true,
	}));  

const port = 3000;
app.listen(port, () => {
	console.log(`now listening for requests on port ${port}`);
	});


