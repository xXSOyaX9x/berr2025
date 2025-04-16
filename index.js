const cors = require('cors');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
const port = 3000;

let db;

// MongoDB connection
const checkDB = (req, res, next) => {
  if (!db) return res.status(500).json({ message: "Database not connected!" });
  next();
};

async function connectToMongoDB() {
  const uri = "mongodb://localhost:27017";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    db = client.db("testDB");
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectToMongoDB();
app.listen(port, () => console.log(`Server running on port ${port}`));

// DRIVER ROUTES
app.post('/drivers', checkDB, async (req, res) => {
  try {
    const { driverId, carModel, phone } = req.body;
    const result = await db.collection('drivers').insertOne({ driverId, carModel, phone });
    res.status(201).json({ message: 'Driver created', driverId: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: 'Invalid driver data' });
  }
});

app.get('/drivers', checkDB, async (req, res) => {
  try {
    const drivers = await db.collection('drivers').find().toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// ORDER ROUTES
app.post('/order', checkDB, async (req, res) => {
  try {
    const { username, phone, driverId, driverName, carModel, pickup, destination, status } = req.body;
    const result = await db.collection('orders').insertOne({
      username, phone, driverId, driverName, carModel, pickup, destination, status: status || 'requested'
    });
    res.status(201).json({ message: 'Order created', orderId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid order data' });
  }
});

app.get('/order', checkDB, async (req, res) => {
  try {
    const orders = await db.collection('orders').find().toArray();
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.patch('/order/:id', checkDB, async (req, res) => {
  try {
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status } }
    );
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Order not found or no change made' });
    }
    res.status(200).json({ message: 'Order status updated' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid order ID or data' });
  }
});

app.delete('/order/:id', checkDB, async (req, res) => {
  try {
    const result = await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(200).json({ message: 'Order deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid order ID' });
  }
});

