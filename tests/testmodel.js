require('dotenv').config();


const ddbgoose = require('./ddbgoose');
global.ddb_connection = ddbgoose.client();
ddb_connection.connect( process.env.AWS_REGION );


const Article = require('./models/article_ddb');

// create new record

let article = new Article( {
		name: "Architecture in the large",
		topic: "Architecture",
		date: "04/27/2021",
		contributorId: "1"

		} );
article.save();

