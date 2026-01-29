/**
 * Chaos Module - Schrödinger's Warehouse Simulation
 * Simulates partial failures where DB commit succeeds but response fails
 */

// Configuration from environment
const CHAOS_ENABLED = process.env.CHAOS_ENABLED === 'true';
const CHAOS_CRASH_PROBABILITY = parseFloat(process.env.CHAOS_CRASH_PROBABILITY) || 0.1;

// Track chaos events for monitoring
let chaosEventCount = 0;
let lastChaosEvent = null;

/**
 * Determine if a chaos event (crash simulation) should occur
 * @returns {boolean}
 */
function shouldSimulateCrash() {
  if (!CHAOS_ENABLED) {
    return false;
  }
  
  return Math.random() < CHAOS_CRASH_PROBABILITY;
}

/**
 * Simulate a crash after successful DB operation
 * This demonstrates the Schrödinger's Warehouse problem
 * @param {string} context - Description of what operation was completed
 * @throws {Error} - Simulated crash error
 */
function simulateCrashAfterCommit(context) {
  if (shouldSimulateCrash()) {
    chaosEventCount++;
    lastChaosEvent = {
      time: new Date().toISOString(),
      context,
      message: 'Simulated crash after DB commit'
    };
    
    console.error(`[Chaos] SIMULATED CRASH after: ${context}`);
    console.error('[Chaos] DB commit succeeded but response will fail');
    
    // Throw error to simulate process crash after successful commit
    const error = new Error(`Schrödinger's Warehouse: Crash after ${context}`);
    error.isChaosEvent = true;
    error.dbCommitSucceeded = true;
    throw error;
  }
}

/**
 * Get chaos module status
 */
function getChaosStatus() {
  return {
    enabled: CHAOS_ENABLED,
    crashProbability: CHAOS_CRASH_PROBABILITY,
    totalChaosEvents: chaosEventCount,
    lastChaosEvent
  };
}

/**
 * Reset chaos counters (for testing)
 */
function resetChaosCounters() {
  chaosEventCount = 0;
  lastChaosEvent = null;
}

module.exports = {
  shouldSimulateCrash,
  simulateCrashAfterCommit,
  getChaosStatus,
  resetChaosCounters
};
