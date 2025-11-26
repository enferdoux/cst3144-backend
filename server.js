// server.js - Express backend using native MongoDB driver
// This file sets up an Express server, connects to MongoDB, and exposes
// simple CRUD/search endpoints for "lessons" and an order creation endpoint.

// Import Express framework for building the server
const express = require('express');
// Import CORS middleware to allow cross-origin requests from the frontend
const cors = require('cors');
// Node path for serving static files (images)
const path = require('path');
// MongoDB native driver: MongoClient to connect, ObjectId to work with _id fields
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// Allow CORS (adjust options in production as needed)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Parse JSON request bodies
app.use(express.json());

// Simple request logger middleware for basic request tracing
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (req, res) => res.send('Server is running'));


// Serve static lesson images from /public/images at the /images URL path.
// e.g., GET /images/example.jpg will serve public/images/example.jpg
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// MongoDB connection configuration
// Use environment variables when available, otherwise default to local MongoDB.
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'cst3144';
let db; // will hold the connected database instance

// Initialize MongoDB connection asynchronously on startup.
// Exits the process if the connection fails so the app doesn't run without DB.
async function initDb() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  console.log('Connected to MongoDB', mongoUri, dbName);
}
initDb().catch(err => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});

// Routes

// GET /lessons - returns all lesson documents
// Note: consider adding pagination in production to avoid returning huge result sets.
app.get('/lessons', async (req, res) => {
  const lessons = await db.collection('lessons').find({}).toArray();
  res.json(lessons);
});

// GET /orders - returns all order documents
app.get('/orders', async (req, res) => {
  const orders = await db.collection('orders').find({}).toArray();
  res.json(orders);
});

// GET /lessons/:id - returns a single lesson by ObjectId
// Returns 404 if not found, 400 for invalid id format.
app.get('/lessons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const lesson = await db.collection('lessons').findOne({ _id: new ObjectId(id) });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (e) {
    // Likely thrown by new ObjectId(id) when id is invalid
    res.status(400).json({ error: 'Invalid id' });
  }
});

// GET /search?q=... - simple backend search across a few fields
// Uses a case-insensitive regex to match topic, location, price (as string), or space.
// Note: using regex queries can be slow on large collections; consider text indexes.
app.get('/search', async (req, res) => {
  const q = req.query.q || '';
  const regex = new RegExp(q, 'i');
  const results = await db.collection('lessons').find({
    $or: [
      { topic: regex },
      { location: regex },
      { price: { $regex: regex } },
      { space: { $regex: regex } },
    ]
  }).toArray();
  res.json(results);
});

// POST /orders - create a new order document
// Expected body: { name: string, phone: string, lessonIDs: [idString, ...] }
// Validates basic shape, converts lessonIDs to ObjectId and stores createdAt timestamp.
app.post('/orders', async (req, res) => {
  const { name, phone, lessonIDs } = req.body;
  if (!name || !phone || !Array.isArray(lessonIDs) || lessonIDs.length === 0) {
    return res.status(400).json({ error: 'Invalid order data' });
  }
  const order = {
    name,
    phone,
    // Convert string ids to ObjectId for storage
    lessonIDs: lessonIDs.map(id => new ObjectId(id)),
    createdAt: new Date()
  };
  const result = await db.collection('orders').insertOne(order);

  res.json({ insertedId: result.insertedId });
});

// PUT /lessons/:id - update fields of an existing lesson
// Expects the fields to update in the request body; uses $set to apply updates.
// Returns 400 if id is invalid.
app.put('/lessons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const update = { $set: req.body };
    await db.collection('lessons').updateOne({ _id: new ObjectId(id) }, update);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid id or update' });
  }
});

// Health check endpoint for uptime monitoring
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Start server on configured port (NODE_PORT or PORT), default 3000.
// In production, ensure the port is provided by the hosting environment.
const port = process.env.PORT || process.env.NODE_PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});