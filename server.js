// server.js - Express backend using native MongoDB driver
// Import Express framework for building the server
const express = require('express');
// Import CORS middleware to allow cross-origin requests
const cors = require('cors');
// Import path module for file path operations
const path = require('path');
// Import MongoDB client and ObjectId for database operations
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Static file middleware for lesson images (in /public/images)
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// MongoDB connection (expect MONGODB_URI env var)
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'cst3144';
let db;

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

// GET /lessons - returns all lessons
app.get('/lessons', async (req, res) => {
  const lessons = await db.collection('lessons').find({}).toArray();
  res.json(lessons);
});

// GET /lessons/:id - optional single lesson
app.get('/lessons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const lesson = await db.collection('lessons').findOne({ _id: new ObjectId(id) });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (e) {
    res.status(400).json({ error: 'Invalid id' });
  }
});

// GET /search?q=... - simple back-end search across fields
app.get('/search', async (req, res) => {
  const q = req.query.q || '';
  // Simple case-insensitive substring match across topic, location, price (string), space
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

// POST /orders - create new order
app.post('/orders', async (req, res) => {
  const { name, phone, lessonIDs } = req.body;
  if (!name || !phone || !Array.isArray(lessonIDs) || lessonIDs.length === 0) {
    return res.status(400).json({ error: 'Invalid order data' });
  }
  const order = {
    name,
    phone,
    lessonIDs: lessonIDs.map(id => new ObjectId(id)),
    createdAt: new Date()
  };
  const result = await db.collection('orders').insertOne(order);

  res.json({ insertedId: result.insertedId });
});

// PUT /lessons/:id - update any attribute of a lesson
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

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Start server
const port = process.env.PORT || process.env.NODE_PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});