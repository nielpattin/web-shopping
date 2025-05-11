import express, { json } from 'express';
import mongoose, { Schema } from 'mongoose'; 
import { Search, Ingest } from 'sonic-channel';
import 'dotenv/config'

console.log('--- Environment Variables ---');
console.log('MONGO_URI:', process.env.MONGO_URI);
console.log('SONIC_HOST:', process.env.SONIC_HOST);
console.log('SONIC_PORT:', process.env.SONIC_PORT);
console.log('SONIC_AUTH:', process.env.SONIC_AUTH);
console.log('---------------------------');

const app = express();
const port = 3000;

app.use(json());

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI
const DB_NAME = 'let_shopping';
const COLLECTION_NAME = 'items';

const SONIC_HOST = process.env.SONIC_HOST
const SONIC_PORT = parseInt(process.env.SONIC_PORT, 10)
const SONIC_AUTH = process.env.SONIC_AUTH;

// --- Mongoose Schema and Model ---
const itemSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, default: 0 },
  category: String,
  createdAt: { type: Date, default: Date.now },
});

const Item = mongoose.model('Item', itemSchema, COLLECTION_NAME);

async function connectToMongo() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    console.log('Connected to MongoDB using Mongoose');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

// --- Sonic Channels ---
let sonicIngest;
let sonicSearch;

function connectToSonic() {
  sonicIngest = new Ingest({
    host: SONIC_HOST,
    port: SONIC_PORT,
    auth: SONIC_AUTH,
  }).connect({
    connected: () => console.log('Sonic Ingest connected!'),
    error: (err) => console.error('Sonic Ingest connection error:', err),
    disconnected: () => console.error('Sonic Ingest disconnected'),
    timeout: () => console.error('Sonic Ingest timeout'),
    retrying: () => console.error('Sonic Ingest retrying...'),
  });

  sonicSearch = new Search({
    host: SONIC_HOST,
    port: SONIC_PORT,
    auth: SONIC_AUTH,
  }).connect({
    connected: () => console.log('Sonic Search connected!'),
    error: (err) => console.error('Sonic Search connection error:', err),
    disconnected: () => console.error('Sonic Search disconnected'),
    timeout: () => console.error('Sonic Search timeout'),
    retrying: () => console.error('Sonic Search retrying...'),
  });
}

// --- Express Routes ---

// Endpoint to add/update an item (and ingest into Sonic)
app.post('/items', async (req, res) => {
  const { name, description, price, category } = req.body;

  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  try {
    // 1. Save to MongoDB
    // Create new document
    const newItem = new Item({ 
      name,
      description,
      price: parseFloat(price) || 0,
      category,
    });
    const savedItem = await newItem.save(); // Save document
    const itemId = savedItem._id.toString(); // Get ID from saved document

    // 2. Ingest into Sonic
    // Use the item's name and description for searching.
    const searchableText = `${name} ${description} ${category || ''}`;
    await sonicIngest.push(
      'items', // collection
      'default', // bucket
      itemId, // Use MongoDB's _id as the Sonic object ID
      searchableText.trim()
    );

    console.log(`Item ${itemId} ingested into Sonic.`);
    res.status(201).json({ message: 'Item added successfully', itemId, ...savedItem.toObject() });
  } catch (err) {
    console.error('Error adding item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Endpoint to search for items
app.get('/search', async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Search query "q" is required' });
  }

  try {
    // 1. Query Sonic
    const sonicResults = await sonicSearch.query(
      'items', // collection
      'default', // bucket
      q.toString()
    );

    console.log('Sonic search results (IDs):', sonicResults);

    if (!sonicResults || sonicResults.length === 0) {
      return res.json([]);
    }
    
    // Fetch items from MongoDB using the IDs returned by Sonic
    const items = await Item.find({ _id: { $in: sonicResults } }).lean(); 

    // Optional: Maintain the order returned by Sonic if it's relevant
    const orderedItems = sonicResults.map(id => items.find(item => item._id.toString() === id)).filter(item => item);

    res.json(orderedItems);
  } catch (err) {
    console.error('Error searching items:', err);
    if (err.message && err.message.includes('ERR_QUERY_INVALID_LIMIT_OFFSET')) {
        return res.status(400).json({ error: 'Invalid search parameters for Sonic.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to search items' });
  }
});

// --- Start Server ---
async function startServer() {
  await connectToMongo();
  connectToSonic(); // Sonic connections are asynchronous, they will log their status

  app.listen(port, () => {
    console.log(`Shoppe API server listening at http://localhost:${port}`);
  });
}

startServer();