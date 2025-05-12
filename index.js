import express, { json } from 'express';
import mongoose, { Schema } from 'mongoose'; 
import { Search, Ingest } from 'sonic-channel';
import 'dotenv/config'
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pinoHttp from 'pino-http';
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

logger.info('--- Environment Variables ---');
logger.info(`MONGO_URI: ${process.env.MONGO_URI}`);
logger.info(`SONIC_HOST: ${process.env.SONIC_HOST}`);
logger.info(`SONIC_PORT: ${process.env.SONIC_PORT}`);
logger.info(`SONIC_AUTH: ${process.env.SONIC_AUTH}`);
logger.info('---------------------------');

const app = express();
const port = 3001;

app.use(pinoHttp({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  },
  serializers: {
    req(req) {
      if (process.env.NODE_ENV === "development") {
        return {
          method: req.method,
          url: req.url,
        };
      } else {
        // For production or other environments, keep the concise logging
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      }
    },
    res(res) {
      return {
        statusCode: res.statusCode
        // Add specific response headers if needed
      };
    }
  }
}));
app.use(json());
app.use(express.static(path.join(__dirname, 'public')));

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
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

// --- Sonic Channels ---
let sonicIngest;
let sonicSearch;

// --- Express Routes ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint for item search when user types 
app.get('/search', async (req, res) => {
  const { q } = req.query;

  if (!q || q.toString().trim() === '') {
    return res.json([]);
  }

  try {
    const incomingQueryString = q.toString().trim().toLowerCase();
    const queryWords = incomingQueryString.split(/\s+/).filter(word => word.length > 0); // Split into words and remove empty strings

    if (queryWords.length === 0) {
      return res.json([]);
    }

    logger.info(`Searching for words: "${queryWords.join('", "')}"`);

    let objectIds = new Set();

    for (const word of queryWords) {
      try {
        const searchResults = await sonicSearch.query(
          'items',           // collection
          'search',          // using dedicated search bucket
          word,              // query string (single word)
          10,                // limit results per word (can be adjusted)
          0                  // offset
        );
        if (searchResults && searchResults.length > 0) {
          searchResults.forEach(id => objectIds.add(id));
          logger.info(`Found ${searchResults.length} IDs for "${word}": ${searchResults.join(', ')}`);
        } else {
          logger.info(`No Sonic results for "${word}"`);
        }
      } catch (err) {
        logger.error(`Error getting search results from Sonic for "${word}":`, err);
      }
    }
    logger.info(`Total unique Object IDs from Sonic: ${objectIds.size}`);

    if (objectIds.size > 0) {
      const idArray = Array.from(objectIds);

      const products = await Item.find({
        _id: { $in: idArray }
      }).select('name').lean();

      const productNames = products.map(product => product.name);
      logger.info(`Returning ${productNames.length} product search results (all matches found by Sonic for the query terms)`);
      res.json(productNames);
    } else {
      logger.info('No search results found from Sonic for any query word');
      res.json([]);
    }
  } catch (err) {
    logger.error('Error getting search results:', err);
    res.status(500).json({ error: 'Failed to get search results' });
  }
});

// --- Start Server ---
async function startServer() {
  await connectToMongo();
  
  // Connect to Sonic and wait for connection to be established
  let isConnectedIngest = false;
  let isConnectedSearch = false;
  
  // Set up connection event listeners before connecting
  const sonicConnected = new Promise((resolve, reject) => {
    // Store original event listeners
    const origIngestEvents = {
      connected: () => logger.info('Sonic Ingest connected!'),
      error: (err) => logger.error('Sonic Ingest connection error:', err),
    };
    
    const origSearchEvents = {
      connected: () => logger.info('Sonic Search connected!'),
      error: (err) => logger.error('Sonic Search connection error:', err),
    };
    
    // Create the Ingest instance with modified handlers
    sonicIngest = new Ingest({
      host: SONIC_HOST,
      port: SONIC_PORT,
      auth: SONIC_AUTH,
    }).connect({
      connected: () => {
        origIngestEvents.connected();
        isConnectedIngest = true;
        checkBothConnected();
      },
      error: (err) => {
        origIngestEvents.error(err);
        if (!isConnectedIngest) {
          reject(new Error('Failed to connect to Sonic Ingest: ' + err.message)); // Use err.message
        }
      },
      disconnected: () => logger.error('Sonic Ingest disconnected'),
      timeout: () => logger.error('Sonic Ingest timeout'),
      retrying: () => logger.warn('Sonic Ingest retrying...'), // warn for retrying
    });
    
    // Create the Search instance with modified handlers
    sonicSearch = new Search({
      host: SONIC_HOST,
      port: SONIC_PORT,
      auth: SONIC_AUTH,
    }).connect({
      connected: () => {
        origSearchEvents.connected();
        isConnectedSearch = true;
        checkBothConnected();
      },
      error: (err) => {
        origSearchEvents.error(err);
        if (!isConnectedSearch) {
          reject(new Error('Failed to connect to Sonic Search: ' + err.message)); // Use err.message
        }
      },
      disconnected: () => logger.error('Sonic Search disconnected'),
      timeout: () => logger.error('Sonic Search timeout'),
      retrying: () => logger.warn('Sonic Search retrying...'), // warn for retrying
    });
    
    // Function to check if both connections are established
    function checkBothConnected() {
      if (isConnectedIngest && isConnectedSearch) {
        logger.info('Both Sonic Ingest and Search connections established!');
        resolve(true);
      }
    }
    
    // Set a timeout in case connections take too long
    setTimeout(() => {
      if (!isConnectedIngest || !isConnectedSearch) {
        logger.warn('Sonic connection timed out after 10 seconds, proceeding anyway...');
        logger.warn(`Connection status: Ingest=${isConnectedIngest}, Search=${isConnectedSearch}`);
        resolve(false); // Resolve false as it's proceeding
      }
    }, 10000);
  });
  
  // Wait for Sonic to connect before proceeding
  await sonicConnected;
  
  // Only import if we have both connections
  if (isConnectedIngest && isConnectedSearch) {
    // Import existing MongoDB data into Sonic
    await importMongoDataToSonic();
  } else {
    logger.warn('Skipping Sonic import because one or more Sonic connections failed.');
  }

  app.listen(port, () => {
    logger.info(`Shoppe API server listening at http://localhost:${port}`);
  });
}

// Function to import all MongoDB data into Sonic
async function importMongoDataToSonic() {
  try {
    logger.info('Importing MongoDB data into Sonic...');
    
    // Get all items from MongoDB
    const items = await Item.find({}).lean();
    
    if (items.length === 0) {
      logger.info('No items found in MongoDB to import.');
      return;
    }
    
    logger.info(`Found ${items.length} items in MongoDB. Starting import to Sonic...`);
    
    // First, let's flush the existing collection to avoid duplicates
    try {
      await sonicIngest.flushc('items');
      logger.info('Flushed existing Sonic collection.');
    } catch (err) {
      // If collection doesn't exist yet, that's fine
      logger.info('Could not flush Sonic collection (it may not exist yet).');
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Push each item to Sonic
    for (const item of items) {
        const itemId = item._id.toString();
        try {
          await sonicIngest.push(
            'items',            // collection
            'search',           // special bucket for search
            itemId,             // object ID
            item.name.toLowerCase()           // Full product name (lowercase)
          );
          
          // logger.info(`Added product name to search: "${fullName}" for item ${itemId}`);
        } catch (err) {
          logger.error(`Error adding search for item ${item._id}:`, err);
          errorCount++; 
        }
        
        successCount++; // Counts items for which an import attempt was made
        
        // Log progress for every 100 items attempted
        if (successCount % 100 === 0) {
          logger.info(`Attempted import for ${successCount} items to Sonic...`);
        }
    }
    
    logger.info(`Sonic import completed. Attempted items: ${successCount}, Errors during push: ${errorCount}`);
  } catch (err) {
    logger.error('Error during Sonic import:', err);
  }
}

startServer();