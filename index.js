const cors = require('cors');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
const port = 3000;

let db;

const checkDB = (req, res, next) => {
       if (!db) {
            return res.status(500).json({ message: "Database connection not established!" });
       }
  next();
  };
  
async function connectToMongoDB() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB!");
        db = client.db("testDB");
    } catch (err) {
        console.error("Error connecting to MongoDB:", err);
    }
}

connectToMongoDB();

    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });

app.get('/rides', checkDB, async (req, res) => {
  try {
    const rides = await db.collection('rides').find().toArray();
    res.status(200).json(rides);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

app.post('/rides', checkDB, async (req, res) => {
  try {
    const { name, pickup, dropoff, status } = req.body;

    const result = await db.collection('rides').insertOne({
      name,
      pickup,
      dropoff,
      status: status || 'pending'
    });

    res.status(201).json({ message: 'Ride created', rideId: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: 'Invalid ride data' });
  }
});


app.patch('/rides/:id', checkDB, async (req, res) => {
  try {
    const result = await db.collection('rides').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    res.status(200).json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(400).json({ error: "Invalid ride ID or data" });
  }
});

app.delete('/rides/:id', checkDB, async (req, res) => {
  try {
    const result = await db.collection('rides').deleteOne(
      { _id: new ObjectId(req.params.id) }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    res.status(200).json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(400).json({ error: "Invalid ride ID" });
  }
});
