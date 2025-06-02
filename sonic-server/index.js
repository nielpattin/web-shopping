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
  name: `${process.env.NODE_ENV}`
});


logger.info('--- Environment Variables for Sonic Server ---');
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
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
    logger.info(`Starting Sonic server for ${process.env.NODE_ENV} environment...`);
    const isProduction = process.env.NODE_ENV === 'production';
    const sonicCmdPath = isProduction ? "/app/sonic/sonic" : "./sonic/sonic";
    const sonicConfigPath = isProduction ? "/etc/sonic.cfg" : "./sonic.cfg";

    const sonicProcess = spawn(sonicCmdPath, ['-c', sonicConfigPath], {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
    });

    let sonicReady = false;

    sonicProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('(INFO) - listening on tcp://0.0.0.0:1491')) {
        if (sonicReady) return; // Already processed ready signal
        sonicReady = true;
        logger.info(`Sonic server ready - connecting channels`);

        const origIngestEvents = {
          connected: () => {
            logger.info(`Sonic Ingest connected`);
            isConnectedIngest = true;
            checkBothConnected();
          },
          error: (err) => {
            logger.error(`Sonic Ingest connection error: ${err.message}`);
            recentErrors.push(`Sonic Ingest error: ${err.message}`);
          },
          disconnected: () => {
            logger.error(`Sonic Ingest disconnected`);
            isConnectedIngest = false;
          },
          timeout: () => {
            logger.error(`Sonic Ingest timeout`);
            recentErrors.push(`Sonic Ingest timeout`);
            if (!isConnectedIngest) {
              singleReject(new Error(`Sonic Ingest connection timed out`));
            }
          },
          retrying: () => logger.warn(`Sonic Ingest retrying...`),
        };

        const origSearchEvents = {
          connected: () => {
            logger.info(`Sonic Search connected`);
            isConnectedSearch = true;
            checkBothConnected();
          },
          error: (err) => {
            logger.error(`Sonic Search connection error: ${err.message}`);
            recentErrors.push(`Sonic Search error: ${err.message}`);
          },
          disconnected: () => {
            logger.error(`Sonic Search disconnected`);
            isConnectedSearch = false;
          },
          timeout: () => {
            logger.error(`Sonic Search timeout`);
            recentErrors.push(`Sonic Search timeout`);
            if (!isConnectedSearch) {
              singleReject(new Error(`Sonic Search connection timed out`));
            }
          },
          retrying: () => logger.warn(`Sonic Search retrying...`),
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
      logger.error(`Sonic process error: ${errorOutput}`);
      recentErrors.push(`Sonic stderr: ${errorOutput.substring(0, 200)}`);
    });

    sonicProcess.on('error', (err) => {
      logger.error(`Failed to start Sonic process: ${err.message}`);
      recentErrors.push(`Sonic process spawn error: ${err.message}`);
      singleReject(new Error(`Failed to start Sonic process: ${err.message}`));
    });

    sonicProcess.on('exit', (code, signal) => {
      const exitMsg = `Sonic process exited with code ${code}, signal ${signal}`;
      if (code !== 0 && !promiseSettled) {
        logger.error(exitMsg + " - process failed");
        recentErrors.push(exitMsg);
        singleReject(new Error(exitMsg + " - Sonic server failed to stay running"));
      } else if (!sonicReady && !promiseSettled) {
        logger.error(exitMsg + " - exited before ready");
        recentErrors.push(exitMsg + " (exited before ready)");
        singleReject(new Error(exitMsg + " - Sonic server exited before becoming ready"));
      }
    });

    function checkBothConnected() {
      if (isConnectedIngest && isConnectedSearch) {
        logger.info(`Sonic server connections established`);
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
  let indexedCount = 0;
  try {
    const items = await Item.countDocuments({});
    indexedCount = items;
  } catch (error) {
    logger.error(`Error getting item count for status: ${error.message}`);
    recentErrors.push(`Error getting item count: ${error.message}`);
  }

  callback(null, {
    node_env: process.env.NODE_ENV,
    is_ingest_connected: isConnectedIngest,
    is_search_connected: isConnectedSearch,
    indexed_item_count: indexedCount,
    message: `Status for ${process.env.NODE_ENV} environment`,
    recent_errors: recentErrors.slice(-5)
  });
}

async function ingestData(call, callback) {
  const { start_index, limit, category_filter } = call.request;

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
      return callback(null, { success: true, ingested_count: 0, message: 'No items found in range' });
    }

    let successCount = 0;
    let errorsDuringIngest = 0;

    for (const item of itemsToIngest) {
      const itemId = item._id.toString();
      try {
        await sonicIngest.push(
          'items',
          'search',
          itemId,
          item.name.toLowerCase()
        );
        successCount++;
      } catch (err) {
        logger.error(`Error ingesting item ${itemId}: ${err.message}`);
        recentErrors.push(`Ingest error for ${itemId}: ${err.message}`);
        errorsDuringIngest++;
      }
    }

    const msg = `Ingested ${successCount} items. Errors: ${errorsDuringIngest}`;
    logger.info(msg);
    callback(null, { success: true, ingested_count: successCount, message: msg });

  } catch (err) {
    logger.error('Error during data ingestion:', err.message);
    recentErrors.push(`General ingest error: ${err.message}`);
    callback(null, { success: false, ingested_count: 0, message: `Failed to ingest data: ${err.message}` });
  }
}

async function triggerInitialIngestion() {
  logger.info(`Starting initial data ingestion...`);

  if (!isConnectedIngest || !sonicIngest) {
    const msg = `Sonic Ingest not connected. Cannot perform initial ingestion.`;
    logger.error(msg);
    recentErrors.push(msg);
    return;
  }

  try {
    const itemsToIngest = await Item.find({}).limit(10000000).lean();

    if (itemsToIngest.length === 0) {
      logger.info(`No items found in MongoDB to ingest.`);
      return;
    }

    logger.info(`Found ${itemsToIngest.length} items to ingest`);

    let successCount = 0;
    let errorsDuringIngest = 0;

    for (const item of itemsToIngest) {
      const itemId = item._id.toString();
      try {
        const textToIngest = [item.name, item.description, item.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (textToIngest.trim()) {
          await sonicIngest.push(
            'items',
            'search',
            itemId,
            textToIngest
          );
          successCount++;
        }
      } catch (err) {
        logger.error(`Error ingesting item ${itemId}: ${err.message}`);
        recentErrors.push(`Ingest error for ${itemId}: ${err.message}`);
        errorsDuringIngest++;
      }
    }
    logger.info(`Initial ingestion complete. Successfully ingested: ${successCount}, Errors: ${errorsDuringIngest}`);
  } catch (err) {
    logger.error(`Critical error during initial ingestion: ${err.message}`);
    recentErrors.push(`Critical ingest error: ${err.message}`);
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
  const { query_string, limit } = call.request;

  if (!isConnectedSearch || !sonicSearch) {
    logger.error('Sonic Search is not connected');
    return callback(null, { items: [] });
  }

  try {
    const objectIds = await sonicSearch.query('items', 'search', query_string, limit || 10, 0);

    if (!objectIds || objectIds.length === 0) {
      return callback(null, { items: [] });
    }

    const mongoItems = await Item.find({
      '_id': { $in: objectIds }
    }).lean();

    const itemDetailsList = mongoItems.map(item => ({
      id: item._id.toString(),
      name: item.name || '',
      description: item.description || '',
      price: typeof item.price === 'number' ? item.price : 0,
      category: item.category || '',
      createdAt: (item.createdAt && item.createdAt instanceof Date) ? item.createdAt.toISOString() : ''
    }));

    callback(null, { items: itemDetailsList });

  } catch (err) {
    logger.error('Critical error in SearchAndFetchItems:', err.message);
    callback(null, { items: [] });
  }
}

function startGrpcServer() {
  grpcServer.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error(`[GRPC] Failed to bind gRPC server on port ${GRPC_PORT}: ${err.message}`);
        recentErrors.push(`gRPC bind error: ${err.message}`);
      } else {
        logger.info(`[GRPC] gRPC server listening on port ${port}`);
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
    logger.warn(`Skipping initial ingestion - Sonic connections not fully established`);
  }

}

startWrapperServer();