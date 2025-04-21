// index.js
const cors = require('cors');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
const port = 3000;

let db;

// Connect to MongoDB
async function connectToMongoDB() {
  const uri = "mongodb://localhost:27017";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    db = client.db("rideHailingDB");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
connectToMongoDB();

const checkDB = (req, res, next) => {
  if (!db) return res.status(500).json({ message: "Database not connected!" });
  next();
};

// User Registration
app.post('/users', checkDB, async (req, res) => {
  try {
    const { username, email, password, phone, role = 'user' } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const result = await db.collection('users').insertOne({ 
      username, 
      email, 
      password, 
      phone,
      role,
      createdAt: new Date()
    });
    res.status(201).json({ message: 'User registered', userId: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: 'Invalid user data' });
  }
});

// Get single user
app.get('/users/:id', checkDB, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ 
      _id: new ObjectId(req.params.id) 
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(400).json({ error: 'Invalid user ID' });
  }
});

// Update user profile
app.patch('/users/:id', checkDB, async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    const updates = {};
    if (email) updates.email = email;
    if (password) updates.password = password;
    if (phone) updates.phone = phone;

    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update profile' });
  }
});

// User Login
app.post('/auth/login', checkDB, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and Password are required.' });
  }
  const user = await db.collection('users').findOne({ email, password });
  if (user) {
    res.status(200).json({ 
      message: 'Login successful', 
      userId: user._id, 
      role: user.role, 
      username: user.username || email,
      phone: user.phone || ''
    });
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Driver Routes
app.post('/drivers', checkDB, async (req, res) => {
  const { driverName, carModel, phone, status = "available" } = req.body;
  if (!driverName || !carModel || !phone) {
    return res.status(400).json({ error: 'Driver name, car model and phone are required' });
  }
  const result = await db.collection('drivers').insertOne({ 
    driverName, 
    carModel,
    phone,
    status,
    earnings: 0,
    createdAt: new Date()
  });
  res.status(201).json({ message: 'Driver created', driverId: result.insertedId });
});

// Get all drivers (with optional status filter)
app.get('/drivers', checkDB, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const drivers = await db.collection('drivers').find(query).toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// Get available drivers only
app.get('/drivers/available', checkDB, async (req, res) => {
  try {
    const drivers = await db.collection('drivers').find({ status: 'available' }).toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch available drivers' });
  }
});

// Get driver by email
app.get('/drivers/email', checkDB, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required' });
    }
    const driver = await db.collection('drivers').findOne({ driverName: email });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.status(200).json(driver);
  } catch (err) {
    res.status(400).json({ error: 'Failed to fetch driver' });
  }
});

// Update driver profile
app.patch('/drivers/:id', checkDB, async (req, res) => {
  try {
    const { driverName, carModel, phone } = req.body;
    const updates = {};
    if (driverName) updates.driverName = driverName;
    if (carModel) updates.carModel = carModel;
    if (phone) updates.phone = phone;

    const result = await db.collection('drivers').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver profile updated successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update driver profile' });
  }
});

// Update Driver Status
app.patch('/drivers/:id/status', checkDB, async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  try {
    if (!['available', 'unavailable', 'on-ride'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const result = await db.collection('drivers').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.status(200).json({ message: 'Status updated', newStatus: status });
  } catch (err) {
    res.status(400).json({ error: 'Bad request' });
  }
});

// Order Routes
app.post('/orders', checkDB, async (req, res) => {
  const { username, driverId, driverName, carModel, pickup, destination, price, status = "requested" } = req.body;
  const parsedPrice = parseFloat(price) || 0;
  
  try {
    // Check if driver is available
    const driver = await db.collection('drivers').findOne({ _id: new ObjectId(driverId) });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    if (driver.status !== 'available') {
      return res.status(400).json({ error: 'Driver is not available' });
    }

    // Create the order
    const result = await db.collection('orders').insertOne({
      username, 
      driverId, 
      driverName, 
      carModel, 
      pickup, 
      destination, 
      price: parsedPrice, 
      status,
      createdAt: new Date()
    });

    // Update driver status to 'on-ride'
    await db.collection('drivers').updateOne(
      { _id: new ObjectId(driverId) },
      { $set: { status: 'on-ride' } }
    );

    res.status(201).json({ message: 'Order created', orderId: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create order' });
  }
});

// Get all Orders
app.get('/orders', checkDB, async (req, res) => {
  const orders = await db.collection('orders').find().toArray();
  res.status(200).json(orders);
});

// Update Order Status
app.patch('/orders/:id', checkDB, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const order = await db.collection('orders').findOne({ _id: new ObjectId(id) });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const updates = { status };
    if (status === 'completed' && order.status !== 'completed') {
      updates.earning = order.price;
      updates.completedAt = new Date();
    }

    await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    // If order is completed or cancelled, set driver back to available
    if ((status === 'completed' || status === 'cancelled') && order.status !== 'completed') {
      await db.collection('drivers').updateOne(
        { _id: new ObjectId(order.driverId) },
        { $set: { status: 'available' } }
      );
    }

    if (status === 'completed' && order.status !== 'completed') {
      await db.collection('drivers').updateOne(
        { _id: new ObjectId(order.driverId) },
        { $inc: { earnings: order.price } }
      );
    }

    res.status(200).json({ message: 'Order status updated' });
  } catch (err) {
    res.status(400).json({ error: 'Bad request' });
  }
});

// Get Driver Earnings
app.get('/drivers/:id/earnings', checkDB, async (req, res) => {
  try {
    const driver = await db.collection('drivers').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { earnings: 1 } }
    );
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.status(200).json({ earnings: driver.earnings || 0 });
  } catch (err) {
    res.status(400).json({ error: 'Bad request' });
  }
});

// Admin: Get All Users
app.get('/users', checkDB, async (req, res) => {
  const users = await db.collection('users').find().toArray();
  res.status(200).json(users);
});

// Admin: Delete User
app.delete('/admin/users/:id', checkDB, async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid user ID format' });
  }

  const result = await db.collection('users').deleteOne({ _id: new ObjectId(id) });
  
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.status(204).send();
});

app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));