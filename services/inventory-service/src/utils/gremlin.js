/**
 * Gremlin Latency Module
 * Introduces deterministic latency to simulate network issues
 */

// Configuration from environment
const GREMLIN_ENABLED = process.env.GREMLIN_ENABLED === 'true';
const GREMLIN_EVERY_NTH_REQUEST = parseInt(process.env.GREMLIN_EVERY_NTH_REQUEST) || 5;
const GREMLIN_DELAY_MS = parseInt(process.env.GREMLIN_DELAY_MS) || 5000;

// Request counter (shared across all instances in this process)
let requestCounter = 0;

/**
 * Check if current request should be delayed
 * Uses deterministic pattern: every Nth request gets delayed
 */
function shouldDelay() {
  if (!GREMLIN_ENABLED) {
    return false;
  }
  
  requestCounter++;
  return requestCounter % GREMLIN_EVERY_NTH_REQUEST === 0;
}

/**
 * Apply gremlin delay if conditions are met
 * @returns {Promise<{delayed: boolean, delayMs: number}>}
 */
async function applyGremlinDelay() {
  const willDelay = shouldDelay();
  
  if (willDelay) {
    console.log(`[Gremlin] Applying ${GREMLIN_DELAY_MS}ms delay (request #${requestCounter})`);
    await new Promise(resolve => setTimeout(resolve, GREMLIN_DELAY_MS));
    return { delayed: true, delayMs: GREMLIN_DELAY_MS };
  }
  
  return { delayed: false, delayMs: 0 };
}

/**
 * Get current gremlin status
 */
function getGremlinStatus() {
  return {
    enabled: GREMLIN_ENABLED,
    everyNthRequest: GREMLIN_EVERY_NTH_REQUEST,
    delayMs: GREMLIN_DELAY_MS,
    currentRequestCount: requestCounter,
    nextDelayIn: GREMLIN_ENABLED ? (GREMLIN_EVERY_NTH_REQUEST - (requestCounter % GREMLIN_EVERY_NTH_REQUEST)) : null
  };
}

/**
 * Reset request counter (for testing)
 */
function resetCounter() {
  requestCounter = 0;
}

module.exports = {
  shouldDelay,
  applyGremlinDelay,
  getGremlinStatus,
  resetCounter
};
