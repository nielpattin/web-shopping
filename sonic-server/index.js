import mongoose, { Schema } from 'mongoose';
import { Search, Ingest } from 'sonic-channel';
import 'dotenv/config';
import pino from 'pino';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { spawn } from 'child_process';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  },
  level: 'info',
  // name: `sonic-node-${process.env.NODE_ID}`
});

logger.info('--- Environment Variables for Sonic Node ---');
logger.info(`NODE_ID: ${process.env.NODE_ID}`);
logger.info(`MONGO_URI: ${process.env.MONGO_URI}`);
logger.info(`SONIC_HOST: ${process.env.SONIC_HOST}`);
logger.info(`SONIC_PORT: ${process.env.SONIC_PORT}`);
logger.info(`SONIC_AUTH: ${process.env.SONIC_AUTH}`);
logger.info(`GRPC_PORT: ${process.env.GRPC_PORT}`);
logger.info('--------------------------------------------');


// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = 'items';

const SONIC_HOST = process.env.SONIC_HOST;
const SONIC_PORT = parseInt(process.env.SONIC_PORT, 10);
const SONIC_AUTH = process.env.SONIC_AUTH;
const GRPC_PORT = process.env.GRPC_PORT;
const NODE_ID = process.env.NODE_ID;

// --- Mongoose Schema and Model ---
const itemSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, default: 0 },
  category: String,
  createdAt: { type: Date, default: Date.now },
});

const Item = mongoose.model('Item', itemSchema, COLLECTION_NAME);

// --- Sonic Channels ---
let sonicIngest;
let sonicSearch;
let isConnectedIngest = false;
let isConnectedSearch = false;
const recentErrors = []; // for status reporting

async function connectToMongo() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

async function connectToSonic() {
  return new Promise((resolve, reject) => {
    let promiseSettled = false;
    const singleResolve = (value) => {
      if (!promiseSettled) {
        promiseSettled = true;
        resolve(value);
      }
    };
    const singleReject = (err) => {
      if (!promiseSettled) {
        promiseSettled = true;
        reject(err);
      }
    };

    // Start Sonic search engine server as a child process
    logger.info(`Starting Sonic server within container for node ${NODE_ID}...`);
    const sonicCmdPath = "/app/sonic/sonic";
    const sonicConfigPath = "/etc/sonic.cfg";
    logger.info(`Spawning Sonic server for node ${NODE_ID} with command: ${sonicCmdPath} -c ${sonicConfigPath}`);

    const sonicProcess = spawn(sonicCmdPath, ['-c', sonicConfigPath], {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
    });

    let sonicReady = false;

    sonicProcess.stdout.on('data', (data) => {
      const output = data.toString();
      // logger.info(`Sonic process stdout (${NODE_ID}): ${output.trim()}`); // TODO: Sonic engine logs, keep here for later use?
      if (output.includes('(INFO) - listening on tcp://0.0.0.0:1491')) {
        if (sonicReady) return; // Already processed ready signal
        sonicReady = true;
        logger.info(`Sonic server for ${NODE_ID} reported listening. Attempting to connect channels.`);

        const origIngestEvents = {
          connected: () => {
            logger.info(`Sonic Ingest connected for ${NODE_ID}!`);
            isConnectedIngest = true;
            checkBothConnected();
          },
          error: (err) => {
            logger.error(`Sonic Ingest connection error for ${NODE_ID}: ${err.message}`);
            recentErrors.push(`Sonic Ingest error (${NODE_ID}): ${err.message}`);
          },
          disconnected: () => {
            logger.error(`Sonic Ingest disconnected for ${NODE_ID}`);
            isConnectedIngest = false;
          },
          timeout: () => {
            logger.error(`Sonic Ingest timeout for ${NODE_ID}`);
            recentErrors.push(`Sonic Ingest timeout (${NODE_ID})`);
            if (!isConnectedIngest) {
              singleReject(new Error(`Sonic Ingest connection timed out for ${NODE_ID}.`));
            }
          },
          retrying: () => logger.warn(`Sonic Ingest retrying for ${NODE_ID}...`),
        };

        const origSearchEvents = {
          connected: () => {
            logger.info(`Sonic Search connected for ${NODE_ID}!`);
            isConnectedSearch = true;
            checkBothConnected();
          },
          error: (err) => {
            logger.error(`Sonic Search connection error for ${NODE_ID}: ${err.message}`);
            recentErrors.push(`Sonic Search error (${NODE_ID}): ${err.message}`);
          },
          disconnected: () => {
            logger.error(`Sonic Search disconnected for ${NODE_ID}`);
            isConnectedSearch = false;
          },
          timeout: () => {
            logger.error(`Sonic Search timeout for ${NODE_ID}`);
            recentErrors.push(`Sonic Search timeout (${NODE_ID})`);
            if (!isConnectedSearch) {
              singleReject(new Error(`Sonic Search connection timed out for ${NODE_ID}.`));
            }
          },
          retrying: () => logger.warn(`Sonic Search retrying for ${NODE_ID}...`),
        };

        sonicIngest = new Ingest({
          host: SONIC_HOST,
          port: SONIC_PORT,
          auth: SONIC_AUTH,
        }).connect(origIngestEvents);

        sonicSearch = new Search({
          host: SONIC_HOST,
          port: SONIC_PORT,
          auth: SONIC_AUTH,
        }).connect(origSearchEvents);
      }
    });

    sonicProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString().trim();
      logger.error(`Sonic process stderr (${NODE_ID}): ${errorOutput}`);
      recentErrors.push(`Sonic stderr (${NODE_ID}): ${errorOutput.substring(0, 200)}`);
    });

    sonicProcess.on('error', (err) => {
      logger.error(`Failed to start Sonic process for ${NODE_ID}: ${err.message}`);
      recentErrors.push(`Sonic process spawn error (${NODE_ID}): ${err.message}`);
      singleReject(new Error(`Failed to start Sonic process for ${NODE_ID}: ${err.message}`));
    });

    sonicProcess.on('exit', (code, signal) => {
      const exitMsg = `Sonic process for ${NODE_ID} exited with code ${code}, signal ${signal}.`;
      if (code !== 0 && !promiseSettled) {
        logger.error(exitMsg + " This happened before channels were fully established or after an issue.");
        recentErrors.push(exitMsg);
        singleReject(new Error(exitMsg + " Sonic server failed to stay running."));
      } else if (!sonicReady && !promiseSettled) {
        logger.error(exitMsg + " Exited before reporting 'listening'.");
        recentErrors.push(exitMsg + " (exited before ready)");
        singleReject(new Error(exitMsg + " Sonic server exited before becoming ready."));
      } else {
        logger.info(exitMsg);
      }
    });

    function checkBothConnected() {
      if (isConnectedIngest && isConnectedSearch) {
        logger.info(`Both Sonic Ingest and Search connections established for ${NODE_ID}!`);
        singleResolve(true);
      }
    }
  });
}

// --- gRPC Server Setup ---
const PROTO_PATH = './proto/sonic_service.proto';
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

// gRPC Service Implementations
const grpcServer = new grpc.Server();

async function getNodeStatus(call, callback) {
  logger.info(`Received GetNodeStatus request for ${NODE_ID}`);
  // TODO: Implement actual status checks for Ingest and Search connections  
  let indexedCount = 0;
  try {
    const items = await Item.countDocuments({}); // Count all items in MongoDB
    indexedCount = items; // Assuming all items are meant to be indexed
  } catch (error) {
    logger.error(`Error getting item count for status: ${error.message}`);
    recentErrors.push(`Error getting item count: ${error.message}`);
  }


  callback(null, {
    node_id: NODE_ID,
    is_ingest_connected: isConnectedIngest,
    is_search_connected: isConnectedSearch,
    indexed_item_count: indexedCount,
    message: `Status for ${NODE_ID}`,
    recent_errors: recentErrors.slice(-5) // Return last 5 errors
  });
}

async function ingestData(call, callback) {
  const { start_index, limit, category_filter } = call.request;
  logger.info(`IngestData request received for ${NODE_ID}: startIndex=${start_index}, limit=${limit}, category=${category_filter}`);

  if (!isConnectedIngest) {
    const msg = 'Sonic Ingest not connected. Cannot ingest data.';
    logger.error(msg);
    recentErrors.push(msg);
    return callback(null, { success: false, ingested_count: 0, message: msg });
  }

  try {
    let query = {};
    if (category_filter) {
      query.category = category_filter;
    }

    const itemsToIngest = await Item.find(query)
      .skip(start_index)
      .limit(limit)
      .lean();

    if (itemsToIngest.length === 0) {
      const msg = 'No new items found to ingest or all items already processed for this range.';
      logger.info(msg);
      return callback(null, { success: true, ingested_count: 0, message: msg });
    }

    let successCount = 0;
    let errorsDuringIngest = 0;

    for (const item of itemsToIngest) {
      const itemId = item._id.toString();
      try {
        await sonicIngest.push(
          'items',      // collection
          'search',     // bucket
          itemId,       // object ID
          item.name.toLowerCase() // Data to be indexed
        );
        successCount++;
      } catch (err) {
        logger.error(`Error ingesting item ${itemId} to Sonic:`, err);
        recentErrors.push(`Ingest error for ${itemId}: ${err.message}`);
        errorsDuringIngest++;
      }
    }

    const msg = `Ingested ${successCount} items to Sonic. Errors: ${errorsDuringIngest}`;
    logger.info(msg);
    callback(null, { success: true, ingested_count: successCount, message: msg });

  } catch (err) {
    logger.error('Error during data ingestion:', err);
    recentErrors.push(`General ingest error: ${err.message}`);
    callback(null, { success: false, ingested_count: 0, message: `Failed to ingest data: ${err.message}` });
  }
}

async function triggerInitialIngestion() {
  logger.info(`[INITIAL_INGEST] Starting initial data ingestion for node ${NODE_ID}...`);

  if (!isConnectedIngest || !sonicIngest) {
    const msg = `[INITIAL_INGEST] Sonic Ingest not connected for node ${NODE_ID}. Cannot perform initial ingestion.`;
    logger.error(msg);
    recentErrors.push(msg);
    return;
  }

  try {
    const itemsToIngest = await Item.find({}).limit(10000000).lean();

    if (itemsToIngest.length === 0) {
      logger.info(`[INITIAL_INGEST] No items found in MongoDB to ingest for node ${NODE_ID}.`);
      return;
    }

    logger.info(`[INITIAL_INGEST] Found ${itemsToIngest.length} items in MongoDB to ingest for node ${NODE_ID}.`);

    let successCount = 0;
    let errorsDuringIngest = 0;

    for (const item of itemsToIngest) {
      const itemId = item._id.toString();
      try {
        const textToIngest = [item.name, item.description, item.category]
          .filter(Boolean) // Remove any null/undefined fields
          .join(' ')       // Join with spaces
          .toLowerCase();  // Convert to lowercase

        // Only ingest if there's text to push
        if (textToIngest.trim()) {
          await sonicIngest.push(
            'items',      // collection
            'search',     // bucket
            itemId,       // object ID
            textToIngest
          );
          successCount++;
        } else {
          logger.warn(`[INITIAL_INGEST] Item ${itemId} has no text content to ingest for node ${NODE_ID}. Skipping.`);
        }
      } catch (err) {
        logger.error(`[INITIAL_INGEST] Error ingesting item ${itemId} to Sonic for node ${NODE_ID}:`, err.message);
        recentErrors.push(`[INITIAL_INGEST] Ingest error for ${itemId}: ${err.message}`);
        errorsDuringIngest++;
      }
    }
    logger.info(`[INITIAL_INGEST] Finished initial ingestion for node ${NODE_ID}. Successfully ingested: ${successCount}, Errors: ${errorsDuringIngest}`);
  } catch (err) {
    logger.error(`[INITIAL_INGEST] Critical error during initial data ingestion for node ${NODE_ID}: ${err.message}`, err.stack);
    recentErrors.push(`[INITIAL_INGEST] Critical ingest error: ${err.message}`);
  }
}

grpcServer.addService(sonic_server_proto.SonicNodeService.service, {
  GetNodeStatus: getNodeStatus,
  IngestData: ingestData,
  SearchAndFetchItems: searchAndFetchItems,
});

/**
 * gRPC handler for SearchAndFetchItems.
 * Queries Sonic for item IDs, then fetches full item details from MongoDB.
 * @param {Object} call - gRPC call object
 * @param {function} callback - gRPC callback
 */
async function searchAndFetchItems(call, callback) {
  logger.info('[SEARCH_FETCH] SearchAndFetchItems handler invoked');
  const { query_string, limit } = call.request;
  logger.info(`[SEARCH_FETCH] Received SearchAndFetchItems gRPC request: query_string="${query_string}", limit=${limit}`);

  if (!isConnectedSearch || !sonicSearch) {
    logger.error('[SEARCH_FETCH] Sonic Search is not connected');
    return callback(null, { items: [] }); // Return empty items list
  }

  try {
    // 1. Query Sonic for object IDs
    logger.info(`[SEARCH_FETCH] Sending query to Sonic: collection="items", bucket="search", terms="${query_string}", limit=${limit || 10}, offset=0`);
    const objectIds = await sonicSearch.query('items', 'search', query_string, limit || 10, 0);
    logger.info(`[SEARCH_FETCH] Sonic returned ${objectIds.length} object IDs: ${JSON.stringify(objectIds)}`);

    if (!objectIds || objectIds.length === 0) {
      return callback(null, { items: [] }); // No results from Sonic
    }

    // 2. Fetch item details from MongoDB using the object IDs
    logger.info(`[SEARCH_FETCH] Fetching item details from MongoDB for IDs: ${JSON.stringify(objectIds)}`);
    const mongoItems = await Item.find({
      '_id': { $in: objectIds }
    }).lean(); // Use .lean() for plain JS objects

    // 3. Map MongoDB items to ItemDetails protobuf message structure
    const itemDetailsList = mongoItems.map(item => ({
      id: item._id.toString(),
      name: item.name || '',
      description: item.description || '',
      price: typeof item.price === 'number' ? item.price : 0,
      category: item.category || '',
      createdAt: (item.createdAt && item.createdAt instanceof Date) ? item.createdAt.toISOString() : ''
    }));

    logger.info(`[SEARCH_FETCH] Returning ${itemDetailsList.length} items with full details.`);
    callback(null, { items: itemDetailsList });

  } catch (err) {
    logger.error({
      message: '[SEARCH_FETCH] Critical error in SearchAndFetchItems',
      errorMessage: err ? err.message : 'N/A',
      errorStack: err ? err.stack : 'N/A',
      errorDetails: err ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : 'N/A'
    });
    callback(null, { items: [] }); // Return empty items list on error
  }
}

function startGrpcServer() {
  logger.info(`[DEBUG] Attempting to bind gRPC server on port ${GRPC_PORT}...`);
  grpcServer.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error(`[DEBUG] Failed to bind gRPC server on port ${GRPC_PORT}:`, err);
        recentErrors.push(`gRPC bind error: ${err.message}`);
      } else {
        logger.info(`[DEBUG] gRPC server successfully bound. Listening on port ${port}`);
      }
    }
  );
}

// --- Start Server ---
async function startWrapperServer() {
  await connectToMongo();
  await connectToSonic();

  // Start gRPC server
  startGrpcServer();

  // Trigger initial data ingestion after connections are established
  if (isConnectedIngest && isConnectedSearch) {
    await triggerInitialIngestion();
  } else {
    logger.warn(`[INITIAL_INGEST] Skipping initial ingestion for ${NODE_ID} as Sonic connections were not fully established during startup sequence.`);
  }

}

startWrapperServer();