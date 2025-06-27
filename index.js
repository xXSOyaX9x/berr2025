const cors = require('cors');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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

// Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Make sure this splits correctly
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    // Add more specific error logging
    console.error("JWT Verification Error:", err.message);
    res.status(401).json({ error: "Invalid token" });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    console.log(`Access denied. Required roles: ${roles}, User role: ${req.user.role}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

// User Registration with Password Hashing
app.post('/users', checkDB, async (req, res) => {
  try {
    const { username, email, password, phone, role = 'user' } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Validate role if provided
    if (role && !['user', 'driver', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await db.collection('users').insertOne({ 
      username, 
      email, 
      password: hashedPassword, 
      phone,
      role, // This will use either the provided role or default to 'user'
      createdAt: new Date()
    });
    res.status(201).json({ message: 'User registered', userId: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: 'Invalid user data' });
  }
});

// User Login with JWT
app.post('/auth/login', checkDB, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and Password are required.' });
  }

  try {
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare hashed password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({ 
      message: 'Login successful', 
      token,
      userId: user._id, 
      role: user.role, 
      username: user.username || email,
      phone: user.phone || ''
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Protected User Profile
app.get('/users/:id', checkDB, authenticate, async (req, res) => {
  try {
    // Only allow users to access their own profile unless admin
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const user = await db.collection('users').findOne({ 
      _id: new ObjectId(req.params.id) 
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't return password hash
    const { password, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
  } catch (err) {
    res.status(400).json({ error: 'Invalid user ID' });
  }
});

// Update user profile (protected)
app.patch('/users/:id', checkDB, authenticate, async (req, res) => {
  try {
    // Only allow users to update their own profile unless admin
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { email, password, phone } = req.body;
    const updates = {};
    if (email) updates.email = email;
    if (phone) updates.phone = phone;

    // Handle password update with hashing
    if (password) {
      const saltRounds = 10;
      updates.password = await bcrypt.hash(password, saltRounds);
    }

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

app.delete('/users/:id', checkDB, authenticate, async (req, res) => {
  try {
    // Only allow users to delete their own account unless admin
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden - can only delete your own account' });
    }

    // First check if user exists
    const user = await db.collection('users').findOne({ 
      _id: new ObjectId(req.params.id) 
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user is a driver, delete their driver profile first
    if (user.role === 'driver') {
      await db.collection('drivers').deleteMany({ 
        $or: [
          { userId: req.params.id },
          { _id: new ObjectId(req.params.id) }
        ]
      });
    }

    // Delete any orders associated with this user
    await db.collection('orders').deleteMany({ 
      $or: [
        { userId: req.params.id },
        { driverId: req.params.id }
      ]
    });

    // Finally delete the user
    const result = await db.collection('users').deleteOne({ 
      _id: new ObjectId(req.params.id) 
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

app.get('/drivers/available-with-users', checkDB, async (req, res) => {
  try {
    const drivers = await db.collection('drivers').aggregate([
      {
        $match: { status: 'available' }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $match: {
          'user': { $exists: true, $ne: null }
        }
      },
      {
        $project: {
          _id: 1,
          driverName: 1,
          carModel: 1,
          phone: 1,
          status: 1,
          'user._id': 1
        }
      }
    ]).toArray();
    
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// Admin-only routes
app.get('/users', checkDB, authenticate, authorize(['admin']), async (req, res) => {
  const users = await db.collection('users').find().toArray();
  // Remove passwords from response
  const sanitizedUsers = users.map(user => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });
  res.status(200).json(sanitizedUsers);
});

app.delete('/admin/users/:id', checkDB, authenticate, authorize(['admin']), async (req, res) => {
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

app.get('/analytics/passengers', checkDB, authenticate, authorize(['admin']), async (req, res) => {
  try {
const pipeline = [
  {
    $match: {
      role: "user"
    }
  },
  {
    $lookup: {
      from: "orders",
      let: { userId: { $toString: "$_id" } }, // Convert _id to string
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [
                { $toString: "$userId" }, // Ensure both sides are strings
                "$$userId"
              ]
            }
          }
        }
      ],
      as: "userOrders"
    }
  },
  {
    $addFields: {
      validOrders: {
        $filter: {
          input: "$userOrders",
          as: "order",
          cond: { $and: [
            { $ifNull: ["$$order.price", false] },
            { $gt: ["$$order.price", 0] }
          ]}
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      userId: "$_id",
      name: "$username",
      email: 1,
      totalRides: { $size: "$validOrders" },
      totalEarnings: {
        $round: [{ $sum: "$validOrders.price" }, 2]
      }
    }
  }
];

    const result = await db.collection('users').aggregate(pipeline).toArray();
    res.status(200).json(result);
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to generate passenger analytics" });
  }
});

// Update the POST /drivers endpoint
app.post('/drivers', checkDB, authenticate, async (req, res) => {
  const {userId, driverName, carModel, phone, status = "available" } = req.body;
  if (!driverName || !carModel || !phone) {
    return res.status(400).json({ error: 'Driver name, car model and phone are required' });
  }

  try {
    // Check if user exists
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if driver already exists for this user
    const existingDriver = await db.collection('drivers').findOne({ userId });
    if (existingDriver) {
      return res.status(400).json({ error: 'Driver profile already exists for this user' });
    }

    const result = await db.collection('drivers').insertOne({ 
      userId,
      driverName, 
      carModel,
      phone,
      status,
      earnings: 0,
      createdAt: new Date()
    });
    
    res.status(201).json({ message: 'Driver created', driverId: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create driver profile' });
  }
});


// Get available drivers
app.get('/drivers/available', checkDB, async (req, res) => {
  try {
    const drivers = await db.collection('drivers')
      .find({ status: 'available' })
      .project({ driverName: 1, carModel: 1, phone: 1 })
      .toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

app.get('/drivers', checkDB, authenticate, async (req, res) => {
  try {
    const { userId, status } = req.query;
    const query = {};
    
    if (userId) {
      query.userId = userId;
    }
    
    if (status) {
      query.status = status;
    }

    const drivers = await db.collection('drivers').find(query).toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

app.patch('/drivers/:id', checkDB, authenticate, async (req, res) => {
  try {
    const { driverName, carModel, phone, status } = req.body;
    const updates = {};
    
    if (driverName) updates.driverName = driverName;
    if (carModel) updates.carModel = carModel;
    if (phone) updates.phone = phone;
    if (status) updates.status = status;

    const result = await db.collection('drivers').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver updated successfully' });
  } catch (err) {
    console.error('Driver update error:', err);
    res.status(500).json({ error: 'Failed to update driver profile' });
  }
});

// Order Routes with Authentication
app.post('/orders', checkDB, authenticate, async (req, res) => {
  const { driverId, pickup, destination, price, status = "requested" } = req.body;
  const parsedPrice = parseFloat(price) || 0;
  
  try {
    // Get user making the request
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

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
      userId: req.user.userId,
      username: user.username || user.email, 
      driverId, 
      driverName: driver.driverName, 
      carModel: driver.carModel, 
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

// Update Order Status
app.patch('/orders/:id', checkDB, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const order = await db.collection('orders').findOne({ _id: new ObjectId(id) });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot modify completed or cancelled orders' });
    }

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

// In index.txt, modify the PATCH /orders/:id endpoint
if (status === 'completed' && order.status !== 'completed') {
  const driverEarnings = order.price; // Assuming 30% platform commission
  await db.collection('drivers').updateOne(
    { _id: new ObjectId(order.driverId) },
    { $inc: { earnings: driverEarnings } } // Only add the driver's portion
  );
}

    res.status(200).json({ message: 'Order status updated' });
  } catch (err) {
    res.status(400).json({ error: 'Bad request' });
  }
});

// Get orders for a specific driver
app.get('/orders/driver/:driverId', checkDB, authenticate, async (req, res) => {
  try {
    const orders = await db.collection('orders').find({ 
      driverId: req.params.driverId 
    }).toArray();
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch driver orders' });
  }
});

// Get all Orders (admin only)
app.get('/orders', checkDB, authenticate, async (req, res) => {
  try {
    let query = {};
    
    // If user is driver, only return their orders
    if (req.user.role === 'driver') {
      const driver = await db.collection('drivers').findOne({ driverName: req.user.email });
      if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
      query.driverId = driver._id.toString();
    }
    
    const orders = await db.collection('orders').find(query).toArray();
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));