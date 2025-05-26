import express, { json } from 'express';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pinoHttp from 'pino-http';
import pino from 'pino';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

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

logger.info('--- Environment Variables for Web Shopping App ---');
logger.info(`SONIC_GRPC_LB_ENDPOINT: ${process.env.SONIC_GRPC_LB_ENDPOINT}`);
logger.info('--------------------------------------------------');

const app = express();
const port = 3030;

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
      };
    }
  }
}));
app.use(json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Sonic gRPC Load Balancer Configuration ---
const SONIC_GRPC_LB_ENDPOINT = process.env.SONIC_GRPC_LB_ENDPOINT || 'nginx:50000'; 
logger.info(`Configured Sonic gRPC Load Balancer Endpoint: ${SONIC_GRPC_LB_ENDPOINT}`);

let sonicGrpcClient;

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

  logger.info(`[SEARCH] Received /search request with raw query: "${q}"`);

  if (!q || q.toString().trim() === '') {
    logger.info('[SEARCH] Query is empty after trim, returning empty array.');
    return res.json([]);
  }

  if (!sonicGrpcClient) {
    logger.error('[SEARCH] Sonic gRPC client not initialized.');
    return res.status(503).json({ error: 'Search service unavailable - client not ready' });
  }

  try {
    const incomingQueryString = q.toString().trim().toLowerCase();
    logger.info(`[SEARCH] Normalized query string: "${incomingQueryString}"`);
    const queryWords = incomingQueryString.split(/\s+/).filter(word => word.length > 0);
    logger.info(`[SEARCH] Parsed query words: ${JSON.stringify(queryWords)}`);

    if (queryWords.length === 0) {
      logger.info('[SEARCH] No valid words after parsing, returning empty array.');
      return res.json([]);
    }

    logger.info(`[SEARCH] Waiting for Sonic gRPC client (via Nginx at ${SONIC_GRPC_LB_ENDPOINT}) to be ready...`);
    await new Promise((resolve, reject) => {
      sonicGrpcClient.waitForReady(Date.now() + 3000, (err) => { // Increased timeout slightly for LB
        if (err) {
          logger.error(`[SEARCH] Sonic gRPC client (Nginx) not ready:`, err);
          reject(new Error('Sonic service (via Nginx) not ready for search'));
        } else {
          logger.info(`[SEARCH] Sonic gRPC client (Nginx) is ready.`);
          resolve();
        }
      });
    });

    // Call SearchAndFetchItems via gRPC to Nginx
    logger.info(`[SEARCH] Sending gRPC SearchAndFetchItems request to Nginx LB (${SONIC_GRPC_LB_ENDPOINT}): { query_string: "${incomingQueryString}", limit: 10 }`);
    const searchRes = await new Promise((resolve, reject) => {
      sonicGrpcClient.SearchAndFetchItems(
        { query_string: incomingQueryString, limit: 10 },
        (err, response) => {
          if (err) {
            logger.error(`[SEARCH] Error calling SearchAndFetchItems via Nginx LB:`, err);
            reject(err);
          } else {
            logger.info(`[SEARCH] Received response from SearchAndFetchItems (Nginx LB): ${response && response.items ? response.items.length : 0} items`);
            resolve(response);
          }
        }
      );
    });

    const items = searchRes.items || [];
    logger.info(`[SEARCH] Total items received from Sonic (via Nginx LB): ${items.length}`);

    if (items.length > 0) {
      logger.info(`[SEARCH] Returning ${items.length} items with full details.`);
      res.json(items);
    } else {
      logger.info('[SEARCH] No items found from Sonic for the query');
      res.json([]);
    }
  } catch (err) {
    logger.error('[SEARCH] Error getting search results:', err && (err.stack || err.message || err), err, JSON.stringify(err));
    res.status(500).json({ error: 'Failed to get search results' });
  }
});

// Endpoint to trigger data ingestion for all items
app.post('/admin/ingest-data', async (req, res) => {
  logger.info('[INGEST_ADMIN] Received POST /admin/ingest-data request');

  if (!sonicGrpcClient) {
    logger.error('[INGEST_ADMIN] Sonic gRPC client not initialized.');
    return res.status(503).json({ error: 'Ingestion service unavailable - client not ready' });
  }

  try {
    const ingestRequest = {
      start_index: 0,
      limit: 1000000, // A large number, effectively "all"
      category_filter: '' // No category filter
    };

    logger.info(`[INGEST_ADMIN] Sending gRPC IngestData request to Nginx LB (${SONIC_GRPC_LB_ENDPOINT}): ${JSON.stringify(ingestRequest)}`);

    // Call IngestData via gRPC to Nginx
    const ingestResponse = await new Promise((resolve, reject) => {
      sonicGrpcClient.IngestData(ingestRequest, (err, response) => {
        if (err) {
          logger.error(`[INGEST_ADMIN] Error ingesting data via Nginx LB:`, err);
          reject(err);
        } else {
          logger.info(`[INGEST_ADMIN] Received response from IngestData via Nginx LB: ${JSON.stringify(response)}`);
          resolve(response);
        }
      });
    });

    res.status(200).json(ingestResponse);

  } catch (err) {
    logger.error('[INGEST_ADMIN] Error processing ingest-data request:', err && (err.stack || err.message || err), err, JSON.stringify(err));
    res.status(500).json({ error: 'Failed to process data ingestion request' });
  }
});

// --- Start Server ---
async function startServer() {
  logger.info(`Initializing gRPC client to Sonic Load Balancer at ${SONIC_GRPC_LB_ENDPOINT}`);
  sonicGrpcClient = new sonic_server_proto.SonicNodeService(
    SONIC_GRPC_LB_ENDPOINT,
    grpc.credentials.createInsecure()
  );

  sonicGrpcClient.waitForReady(Date.now() + 5000, (err) => {
    if (err) {
      logger.error(`Error connecting to Sonic gRPC Load Balancer (${SONIC_GRPC_LB_ENDPOINT}) on startup:`, err);
    } else {
      logger.info(`Successfully connected to Sonic gRPC Load Balancer (${SONIC_GRPC_LB_ENDPOINT}) on startup.`);
    }
  });

  app.listen(port, () => {
    logger.info(`Shoppe API server listening at http://localhost:${port}`);
  });
}

startServer();