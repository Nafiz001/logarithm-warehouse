const axios = require('axios');
const CircuitBreaker = require('opossum');
const { recordInventoryCallMetrics } = require('../utils/metrics');

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://nginx:80/inventory';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS) || 3000;

// Dynamic timeout - can be changed at runtime
let currentTimeoutMs = DEFAULT_TIMEOUT_MS;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000
};

// Circuit breaker configuration
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 10000, // If function takes longer than 10s, trigger failure
  errorThresholdPercentage: 50, // Open circuit when 50% of requests fail
  resetTimeout: 30000, // After 30s, try again
  volumeThreshold: 5 // Minimum requests before calculating error percentage
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getBackoffDelay(attempt, baseDelay, maxDelay) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

/**
 * Inventory Service Client with circuit breaker, retry, and timeout handling
 * Implements idempotent updates using idempotency keys
 */
class InventoryClient {
  constructor() {
    this.client = axios.create({
      baseURL: INVENTORY_SERVICE_URL,
      timeout: currentTimeoutMs,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Create circuit breaker for deductInventory
    this.deductCircuitBreaker = new CircuitBreaker(
      this._deductInventoryInternal.bind(this),
      CIRCUIT_BREAKER_OPTIONS
    );

    // Circuit breaker event handlers
    this.deductCircuitBreaker.on('open', () => {
      console.warn('[CircuitBreaker] OPEN - Inventory service circuit breaker opened');
    });
    this.deductCircuitBreaker.on('halfOpen', () => {
      console.log('[CircuitBreaker] HALF-OPEN - Testing inventory service');
    });
    this.deductCircuitBreaker.on('close', () => {
      console.log('[CircuitBreaker] CLOSED - Inventory service recovered');
    });
  }

  /**
   * Update the timeout value dynamically
   */
  setTimeout(timeoutMs) {
    currentTimeoutMs = timeoutMs;
    this.client.defaults.timeout = timeoutMs;
    console.log(`[InventoryClient] Timeout updated to ${timeoutMs}ms`);
  }

  /**
   * Get current timeout value
   */
  getTimeout() {
    return currentTimeoutMs;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      state: this.deductCircuitBreaker.opened ? 'OPEN' : 
             this.deductCircuitBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED',
      stats: this.deductCircuitBreaker.stats
    };
  }

  /**
   * Internal deduct with retry logic (wrapped by circuit breaker)
   */
  async _deductInventoryInternal(orderId, items, attempt = 0) {
    const startTime = Date.now();
    
    try {
      console.log(`[InventoryClient] Deducting inventory for order ${orderId} (attempt ${attempt + 1})`);
      
      const response = await this.client.post('/deduct', {
        orderId,
        idempotencyKey: `order-${orderId}`,
        items
      });

      recordInventoryCallMetrics(Date.now() - startTime, true, false);
      return { success: true, data: response.data };
    } catch (error) {
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      
      // Already processed - return success
      if (error.response?.status === 409) {
        console.log(`[InventoryClient] Order ${orderId} already processed (idempotent)`);
        return { success: true, alreadyProcessed: true, data: error.response.data };
      }

      // Retry on retryable errors
      const isRetryable = timedOut || error.response?.status >= 500;
      if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
        const delay = getBackoffDelay(attempt, RETRY_CONFIG.baseDelayMs, RETRY_CONFIG.maxDelayMs);
        console.log(`[InventoryClient] Retrying in ${delay}ms (attempt ${attempt + 2}/${RETRY_CONFIG.maxRetries + 1})`);
        await sleep(delay);
        return this._deductInventoryInternal(orderId, items, attempt + 1);
      }

      recordInventoryCallMetrics(Date.now() - startTime, false, timedOut);
      throw error; // Trigger circuit breaker
    }
  }

  /**
   * Deduct inventory with circuit breaker protection
   */
  async deductInventory(orderId, items) {
    try {
      return await this.deductCircuitBreaker.fire(orderId, items);
    } catch (error) {
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      
      // Circuit is open - return graceful failure
      if (this.deductCircuitBreaker.opened) {
        console.warn(`[CircuitBreaker] Circuit OPEN - rejecting request for order ${orderId}`);
        return {
          success: false,
          circuitOpen: true,
          error: 'Inventory service is temporarily unavailable. Please try again later.',
          retryable: true
        };
      }

      if (timedOut) {
        console.warn(`[InventoryClient] Timeout after ${currentTimeoutMs}ms for order ${orderId}`);
        return {
          success: false,
          timedOut: true,
          error: 'Inventory service did not respond in time. Your order may still be processed.',
          retryable: true
        };
      }

      console.error(`[InventoryClient] Error for order ${orderId}:`, error.message);
      return {
        success: false,
        timedOut: false,
        error: error.response?.data?.message || error.message,
        retryable: error.response?.status >= 500
      };
    }
  }

  /**
   * Check inventory availability with retry
   * @param {Array} items - Array of {productId, quantity}
   * @returns {Promise<Object>} - Availability status
   */
  async checkAvailability(items) {
    const startTime = Date.now();

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await this.client.post('/check', { items });
        recordInventoryCallMetrics(Date.now() - startTime, true, false);

        return {
          success: true,
          available: response.data.available,
          items: response.data.items
        };
      } catch (error) {
        const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        const isRetryable = timedOut || error.response?.status >= 500;

        if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
          const delay = getBackoffDelay(attempt, RETRY_CONFIG.baseDelayMs, RETRY_CONFIG.maxDelayMs);
          console.log(`[InventoryClient] checkAvailability retry in ${delay}ms (attempt ${attempt + 2})`);
          await sleep(delay);
          continue;
        }

        recordInventoryCallMetrics(Date.now() - startTime, false, timedOut);

        if (timedOut) {
          return {
            success: false,
            timedOut: true,
            error: 'Inventory check timed out. Please try again.'
          };
        }

        return {
          success: false,
          error: error.response?.data?.message || error.message
        };
      }
    }
  }

  /**
   * Check if an order was already processed in inventory (Schrödinger recovery)
   * @param {string} orderId - The order ID to check
   * @returns {Promise<Object>} - Processing status
   */
  async checkOrderProcessed(orderId) {
    try {
      const response = await this.client.get(`/transactions/order/${orderId}`, { timeout: 3000 });
      return {
        success: true,
        processed: response.data.found || false,
        transactions: response.data.transactions || []
      };
    } catch (error) {
      // If endpoint doesn't exist (404), assume not processed
      if (error.response?.status === 404) {
        return {
          success: true,
          processed: false,
          transactions: []
        };
      }
      return {
        success: false,
        error: error.message,
        processed: false
      };
    }
  }

  /**
   * Get inventory health status
   * @returns {Promise<Object>} - Health status
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health', { timeout: 2000 });
      return {
        healthy: response.data.status === 'healthy',
        data: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = new InventoryClient();
