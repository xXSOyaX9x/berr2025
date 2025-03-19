const { MongoClient } = require('mongodb');

async function main() {
    // Replace with your MongoDB connection string
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        const db = client.db("testDB");
        const collection = db.collection("users");

        // Insert a document
        await collection.insertOne({ name: "Brandon", birth: 2003 });
        console.log("Document inserted!");

        // Query the document
        const result = await collection.findOne({ name: "Brandon" });
        console.log("Query result:", result);

        console.time("Connection Time");
    await client.connect();
    console.timeEnd("Connection Time");


    } catch (err) {
        console.error("Error:", err);
    } finally {
       
    }
}

main();
