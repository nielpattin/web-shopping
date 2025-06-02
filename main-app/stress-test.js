import http from 'node:http';

const BASE_URL = 'http://shop.nielnart.io.vn/search';
const SEARCH_TERMS = ['table', 'soft', 'Intelligent', 'small', 'car']; 
const NUM_REQUESTS = 10000;
const CONCURRENCY_LIMIT = 10000; 

let successfulRequests = 0;
let failedRequests = 0;
const requestPromises = [];

console.log(`Starting stress test with ${NUM_REQUESTS} requests to ${BASE_URL} with random search terms (concurrency: ${CONCURRENCY_LIMIT})...`);

async function sendRequest(requestId) {
  return new Promise((resolve) => {
    const randomTerm = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
    const requestUrl = `${BASE_URL}?q=${encodeURIComponent(randomTerm)}`;
    // console.log(`Request ${requestId}: Sending to ${requestUrl}`); // Optional: log the specific URL
    const req = http.get(requestUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // console.log(`Request ${requestId}: Success (${res.statusCode})`);
          successfulRequests++;
        } else {
          // console.error(`Request ${requestId}: Failed (${res.statusCode})`);
          failedRequests++;
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      // console.error(`Request ${requestId}: Error - ${error.message}`);
      failedRequests++;
      resolve();
    });

    req.end();
  });
}

async function runStressTest() {
  const activeRequests = [];
  for (let i = 0; i < NUM_REQUESTS; i++) {
    const promise = sendRequest(i + 1);
    activeRequests.push(promise);
    requestPromises.push(promise);

    if (activeRequests.length >= CONCURRENCY_LIMIT) {
      await Promise.race(activeRequests); // Wait for the fastest request to complete
      // Remove completed promises from activeRequests
      const index = activeRequests.findIndex(p => p !== promise);
      if (index > -1) {
        activeRequests.splice(index, 1);
      }
    }
     // Simple progress indicator
    if ((i + 1) % (NUM_REQUESTS / 10) === 0 || (i + 1) === NUM_REQUESTS) {
        process.stdout.write(`\rSent ${i + 1}/${NUM_REQUESTS} requests...`);
    }
  }

  await Promise.all(requestPromises); // Wait for all requests to complete

  process.stdout.write('\n'); // New line after progress
  console.log('\nStress Test Complete!');
  console.log('---------------------');
  console.log(`Total Requests: ${NUM_REQUESTS}`);
  console.log(`Successful Requests: ${successfulRequests}`);
  console.log(`Failed Requests: ${failedRequests}`);
  console.log('---------------------');
}

runStressTest().catch(err => {
  console.error("Error during stress test:", err);
});