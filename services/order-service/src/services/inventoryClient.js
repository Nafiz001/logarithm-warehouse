const axios = require('axios');
const { recordInventoryCallMetrics } = require('../utils/metrics');

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://nginx:80/inventory';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS) || 3000;

/**
 * Inventory Service Client with timeout and retry handling
 * Implements idempotent updates using idempotency keys
 */
class InventoryClient {
  constructor() {
    this.client = axios.create({
      baseURL: INVENTORY_SERVICE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Deduct inventory for an order
   * Uses idempotency key to prevent duplicate deductions (Schrödinger's Warehouse fix)
   * @param {string} orderId - The order ID (used as idempotency key)
   * @param {Array} items - Array of {productId, quantity}
   * @returns {Promise<Object>} - Result of inventory update
   */
  async deductInventory(orderId, items) {
    const startTime = Date.now();
    let success = false;
    let timedOut = false;

    try {
      console.log(`[InventoryClient] Deducting inventory for order ${orderId}`);
      
      const response = await this.client.post('/deduct', {
        orderId,
        idempotencyKey: `order-${orderId}`,
        items
      });

      success = true;
      recordInventoryCallMetrics(Date.now() - startTime, true, false);

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      recordInventoryCallMetrics(Date.now() - startTime, false, timedOut);

      if (timedOut) {
        console.warn(`[InventoryClient] Timeout after ${REQUEST_TIMEOUT_MS}ms for order ${orderId}`);
        return {
          success: false,
          timedOut: true,
          error: 'Inventory service did not respond in time. Your order may still be processed.',
          retryable: true
        };
      }

      // Check if it's a known idempotency conflict (already processed)
      if (error.response?.status === 409) {
        console.log(`[InventoryClient] Order ${orderId} already processed (idempotent)`);
        return {
          success: true,
          alreadyProcessed: true,
          data: error.response.data
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
   * Check inventory availability
   * @param {Array} items - Array of {productId, quantity}
   * @returns {Promise<Object>} - Availability status
   */
  async checkAvailability(items) {
    const startTime = Date.now();

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
