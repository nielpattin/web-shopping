import express, { json } from 'express';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pino from 'pino';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  },
  level: 'info',
  name: `${process.env.NODE_ENV}`
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

logger.info('--- Environment Variables for Web Shopping App ---');
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
logger.info(`SONIC_GRPC_ENDPOINT: ${process.env.SONIC_GRPC_ENDPOINT}`);
logger.info('--------------------------------------------------');

const app = express();
const port = 3030;

app.use(json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Sonic gRPC Server Configuration ---
const SONIC_GRPC_ENDPOINT = process.env.SONIC_GRPC_ENDPOINT;

let sonicGrpcClient;

// --- gRPC Connection Configuration ---
const GRPC_CONFIG = {
  INITIAL_RETRY_DELAY: 5000, // 5 seconds
  MAX_RETRY_DELAY: 60000, // 60 seconds
  BACKOFF_MULTIPLIER: 1.5,
  MAX_RETRIES: 20, // Will keep retrying for ~10+ minutes
  CONNECTION_TIMEOUT: 10000 // 10 seconds per attempt
};

// --- gRPC Client Setup ---
const PROTO_PATH = path.resolve(__dirname, 'proto', 'sonic_service.proto');
const packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
const sonic_server_proto = grpc.loadPackageDefinition(packageDefinition).sonic_server;

// --- Express Routes ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint for item search when user types
app.get('/search', async (req, res) => {
  const { q } = req.query;

  logger.info(`[HTTP] [SEARCH] Received search request: "${q}"`);

  if (!q || q.toString().trim() === '') {
    return res.json([]);
  }

  if (!sonicGrpcClient) {
    logger.error(`[GRPC] [SEARCH] Sonic gRPC client not initialized`);
    return res.status(503).json({ error: 'Search service unavailable - client not ready' });
  }

  try {
    const incomingQueryString = q.toString().trim().toLowerCase();
    const queryWords = incomingQueryString.split(/\s+/).filter(word => word.length > 0);

    if (queryWords.length === 0) {
      return res.json([]);
    }

    await new Promise((resolve, reject) => {
      sonicGrpcClient.waitForReady(Date.now() + 3000, (err) => {
        if (err) {
          logger.error(`[GRPC] [SEARCH] Sonic client not ready:`, err);
          reject(new Error('Sonic service not ready for search'));
        } else {
          resolve();
        }
      });
    });

    logger.info(`[GRPC] [SEARCH] Querying Sonic: "${incomingQueryString}"`);
    const searchRes = await new Promise((resolve, reject) => {
      sonicGrpcClient.SearchAndFetchItems(
        { query_string: incomingQueryString, limit: 10 },
        (err, response) => {
          if (err) {
            logger.error(`[GRPC] [SEARCH] Error calling SearchAndFetchItems:`, err);
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });

    const items = searchRes.items || [];
    logger.info(`[SEARCH] Found ${items.length} items`);
    res.json(items);

  } catch (err) {
    logger.error(`[SEARCH] Error getting search results:`, err.message);
    res.status(500).json({ error: 'Failed to get search results' });
  }
});

// Endpoint to trigger data ingestion for all items
app.post('/admin/ingest-data', async (req, res) => {
  logger.info(`[HTTP] [ADMIN] Received data ingestion request`);

  if (!sonicGrpcClient) {
    logger.error(`[GRPC] [ADMIN] Sonic gRPC client not initialized`);
    return res.status(503).json({ error: 'Ingestion service unavailable - client not ready' });
  }

  try {
    const ingestRequest = {
      start_index: 0,
      limit: 1000000,
      category_filter: ''
    };

    logger.info(`[GRPC] [ADMIN] Sending IngestData request`);

    const ingestResponse = await new Promise((resolve, reject) => {
      sonicGrpcClient.IngestData(ingestRequest, (err, response) => {
        if (err) {
          logger.error(`[GRPC] [ADMIN] Error ingesting data:`, err);
          reject(err);
        } else {
          logger.info(`[ADMIN] Ingestion completed: ${response.message}`);
          resolve(response);
        }
      });
    });

    res.status(200).json(ingestResponse);

  } catch (err) {
    logger.error(`[ADMIN] Error processing ingest request:`, err.message);
    res.status(500).json({ error: 'Failed to process data ingestion request' });
  }
});

// --- gRPC Connection with Retry Logic ---
async function connectToSonicWithRetry() {
  let retryCount = 0;
  let retryDelay = GRPC_CONFIG.INITIAL_RETRY_DELAY;

  const attemptConnection = () => {
    return new Promise((resolve, reject) => {
      if (retryCount >= GRPC_CONFIG.MAX_RETRIES) {
        logger.error(`[GRPC] Maximum retry attempts (${GRPC_CONFIG.MAX_RETRIES}) reached. Stopping connection attempts.`);
        return reject(new Error('Maximum retry attempts reached'));
      }

      retryCount++;
      logger.info(`[GRPC] Connection attempt ${retryCount}/${GRPC_CONFIG.MAX_RETRIES} to Sonic server at ${SONIC_GRPC_ENDPOINT}`);

      // Create new gRPC client for each attempt
      const client = new sonic_server_proto.SonicNodeService(
        SONIC_GRPC_ENDPOINT,
        grpc.credentials.createInsecure()
      );

      // Set connection timeout
      const timeoutMs = Date.now() + GRPC_CONFIG.CONNECTION_TIMEOUT;
      
      client.waitForReady(timeoutMs, (err) => {
        if (err) {
          logger.warn(`[GRPC] Connection attempt ${retryCount} failed: ${err.message}`);
          
          // Calculate next retry delay with exponential backoff
          const nextDelay = Math.min(
            retryDelay * GRPC_CONFIG.BACKOFF_MULTIPLIER,
            GRPC_CONFIG.MAX_RETRY_DELAY
          );
          
          logger.info(`[GRPC] Retrying connection in ${nextDelay / 1000} seconds...`);
          
          setTimeout(() => {
            retryDelay = nextDelay;
            attemptConnection().then(resolve).catch(reject);
          }, retryDelay);
        } else {
          logger.info(`[GRPC] Successfully connected to Sonic server on attempt ${retryCount}`);
          sonicGrpcClient = client;
          resolve();
        }
      });
    });
  };

  // Start connection attempts
  logger.info(`[GRPC] Starting connection attempts to Sonic server...`);
  return attemptConnection();
}

// --- Start Background gRPC Connection ---
function startGrpcConnectionInBackground() {
  connectToSonicWithRetry()
    .then(() => {
      logger.info(`[GRPC] Sonic gRPC client is now ready for requests`);
    })
    .catch((err) => {
      logger.error(`[GRPC] Failed to establish connection to Sonic server: ${err.message}`);
      logger.error(`[GRPC] gRPC-dependent endpoints will return service unavailable`);
    });
}

// --- Start Server ---
async function startServer() {
  // Start HTTP server immediately (don't block on gRPC connection)
  app.listen(port, () => {
    logger.info(`[HTTP] Web server listening on port ${port}`);
  });

  // Start gRPC connection attempts in background
  startGrpcConnectionInBackground();
}

startServer();