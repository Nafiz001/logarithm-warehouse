/**
 * Gremlin Latency Module (Redis Global Counter)
 * Introduces deterministic latency using a shared counter across all instances
 */

const Redis = require('ioredis');

// Configuration from environment
const GREMLIN_ENABLED = process.env.GREMLIN_ENABLED === 'true';
const GREMLIN_EVERY_NTH_REQUEST = parseInt(process.env.GREMLIN_EVERY_NTH_REQUEST) || 5;
const GREMLIN_DELAY_MS = parseInt(process.env.GREMLIN_DELAY_MS) || 5000;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

// Redis client (lazy initialization)
let redis = null;

// Fallback local counter (used when Redis is unavailable)
let localCounter = 0;

/**
 * Get Redis client (creates one if not exists)
 */
function getRedisClient() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });
    
    redis.on('error', (err) => {
      console.error('[Gremlin] Redis connection error:', err.message);
    });
    
    redis.on('connect', () => {
      console.log('[Gremlin] Connected to Redis for global counter');
    });
  }
  return redis;
}

/**
 * Check if current request should be delayed (GLOBAL counter)
 * Uses Redis INCR for atomic increment across all instances
 */
async function shouldDelay() {
  if (!GREMLIN_ENABLED) {
    return { delay: false, counter: 0 };
  }
  
  try {
    const client = getRedisClient();
    // Atomic increment shared across ALL instances
    const globalCounter = await client.incr('gremlin:global_counter');
    console.log(`[Gremlin] Global request count: ${globalCounter}`);
    return { delay: globalCounter % GREMLIN_EVERY_NTH_REQUEST === 0, counter: globalCounter };
  } catch (err) {
    // Redis is down - fallback to local counter
    console.error('[Gremlin] Redis unavailable, using local counter:', err.message);
    localCounter++;
    return { delay: localCounter % GREMLIN_EVERY_NTH_REQUEST === 0, counter: localCounter };
  }
}

/**
 * Apply gremlin delay if conditions are met
 * @returns {Promise<{delayed: boolean, delayMs: number, globalCounter: number}>}
 */
async function applyGremlinDelay() {
  const { delay: willDelay, counter } = await shouldDelay();
  
  if (willDelay) {
    console.log(`[Gremlin] 🐢 GLOBAL request #${counter} - Applying ${GREMLIN_DELAY_MS}ms delay`);
    await new Promise(resolve => setTimeout(resolve, GREMLIN_DELAY_MS));
    return { delayed: true, delayMs: GREMLIN_DELAY_MS, globalCounter: counter };
  }
  
  return { delayed: false, delayMs: 0, globalCounter: counter };
}

/**
 * Get current gremlin status
 */
async function getGremlinStatus() {
  let currentCount = 0;
  let mode = 'local (fallback)';
  
  try {
    const client = getRedisClient();
    currentCount = parseInt(await client.get('gremlin:global_counter')) || 0;
    mode = 'global (Redis)';
  } catch (err) {
    console.error('[Gremlin] Could not get counter from Redis:', err.message);
    currentCount = localCounter;
  }
  
  return {
    enabled: GREMLIN_ENABLED,
    everyNthRequest: GREMLIN_EVERY_NTH_REQUEST,
    delayMs: GREMLIN_DELAY_MS,
    globalCounter: currentCount,
    nextDelayIn: GREMLIN_ENABLED 
      ? (GREMLIN_EVERY_NTH_REQUEST - (currentCount % GREMLIN_EVERY_NTH_REQUEST)) % GREMLIN_EVERY_NTH_REQUEST || GREMLIN_EVERY_NTH_REQUEST
      : null,
    mode
  };
}

/**
 * Reset request counter (for testing)
 */
async function resetCounter() {
  try {
    const client = getRedisClient();
    await client.set('gremlin:global_counter', 0);
    console.log('[Gremlin] Global counter reset to 0');
  } catch (err) {
    console.error('[Gremlin] Could not reset counter:', err.message);
  }
  localCounter = 0;
}

module.exports = {
  shouldDelay,
  applyGremlinDelay,
  getGremlinStatus,
  resetCounter
};
