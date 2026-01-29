const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/init');
const { applyGremlinDelay, getGremlinStatus } = require('../utils/gremlin');
const { simulateCrashAfterCommit, getChaosStatus } = require('../utils/chaos');
const { incrementOperations, incrementGremlinDelays, incrementChaosEvents, updateStockLevel } = require('../utils/metrics');

/**
 * Inventory Service - manages stock with chaos simulation
 */
class InventoryService {
  /**
   * Deduct inventory for an order
   * Supports idempotency to handle Schrödinger's Warehouse
   * @param {string} orderId - Order ID
   * @param {string} idempotencyKey - Unique key for idempotent operation
   * @param {Array} items - Array of {productId, quantity}
   * @returns {Promise<Object>} - Result of deduction
   */
  async deductInventory(orderId, idempotencyKey, items) {
    const client = await pool.connect();
    
    try {
      // Apply gremlin latency
      const gremlinResult = await applyGremlinDelay();
      if (gremlinResult.delayed) {
        incrementGremlinDelays();
      }

      await client.query('BEGIN');

      // Check for existing transaction with same idempotency key
      const existingTx = await client.query(
        'SELECT * FROM inventory_transactions WHERE idempotency_key = $1 LIMIT 1',
        [idempotencyKey]
      );

      if (existingTx.rows.length > 0) {
        console.log(`[InventoryService] Idempotent request detected: ${idempotencyKey}`);
        await client.query('COMMIT');
        incrementOperations('deduct', 'idempotent');
        
        return {
          success: true,
          alreadyProcessed: true,
          message: 'Inventory already deducted for this order',
          transactionId: existingTx.rows[0].id
        };
      }

      // Process each item
      const results = [];
      for (const item of items) {
        // Check current stock with row lock
        const stockResult = await client.query(
          'SELECT * FROM products WHERE id = $1 FOR UPDATE',
          [item.productId]
        );

        if (stockResult.rows.length === 0) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const product = stockResult.rows[0];
        
        if (product.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock_quantity}, Requested: ${item.quantity}`);
        }

        // Deduct stock
        const newQuantity = product.stock_quantity - item.quantity;
        await client.query(
          'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newQuantity, item.productId]
        );

        // Record transaction
        const txId = uuidv4();
        await client.query(
          `INSERT INTO inventory_transactions (id, product_id, order_id, idempotency_key, quantity_change, transaction_type)
           VALUES ($1, $2, $3, $4, $5, 'deduct')`,
          [txId, item.productId, orderId, idempotencyKey, -item.quantity]
        );

        results.push({
          productId: item.productId,
          productName: product.name,
          previousStock: product.stock_quantity,
          newStock: newQuantity,
          deducted: item.quantity
        });

        // Update metrics
        updateStockLevel(item.productId, product.name, newQuantity);
      }

      await client.query('COMMIT');
      
      console.log(`[InventoryService] Stock deducted for order ${orderId}`);

      // CHAOS: Simulate crash after successful commit
      try {
        simulateCrashAfterCommit(`inventory deduction for order ${orderId}`);
      } catch (chaosError) {
        if (chaosError.isChaosEvent) {
          incrementChaosEvents();
          // Re-throw to simulate actual crash
          throw chaosError;
        }
        throw chaosError;
      }

      incrementOperations('deduct', 'success');

      return {
        success: true,
        orderId,
        items: results,
        gremlinApplied: gremlinResult.delayed,
        gremlinDelayMs: gremlinResult.delayMs
      };
    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.isChaosEvent) {
        incrementOperations('deduct', 'chaos_crash');
        // The DB was committed before we threw, so this simulates
        // the scenario where data is saved but client gets an error
        throw error;
      }

      incrementOperations('deduct', 'error');
      console.error('[InventoryService] Error deducting inventory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check inventory availability
   * @param {Array} items - Array of {productId, quantity}
   * @returns {Promise<Object>} - Availability status
   */
  async checkAvailability(items) {
    const client = await pool.connect();
    
    try {
      // Apply gremlin latency
      const gremlinResult = await applyGremlinDelay();
      if (gremlinResult.delayed) {
        incrementGremlinDelays();
      }

      const results = [];
      let allAvailable = true;

      for (const item of items) {
        const stockResult = await client.query(
          'SELECT * FROM products WHERE id = $1',
          [item.productId]
        );

        if (stockResult.rows.length === 0) {
          results.push({
            productId: item.productId,
            available: false,
            reason: 'Product not found'
          });
          allAvailable = false;
          continue;
        }

        const product = stockResult.rows[0];
        const available = product.stock_quantity >= item.quantity;

        results.push({
          productId: item.productId,
          productName: product.name,
          requested: item.quantity,
          inStock: product.stock_quantity,
          available
        });

        if (!available) {
          allAvailable = false;
        }
      }

      incrementOperations('check', 'success');

      return {
        available: allAvailable,
        items: results,
        gremlinApplied: gremlinResult.delayed
      };
    } catch (error) {
      incrementOperations('check', 'error');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all products with stock levels
   */
  async getAllProducts() {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM products ORDER BY name'
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get product by ID
   */
  async getProduct(productId) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM products WHERE id = $1',
        [productId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Add stock to a product
   */
  async addStock(productId, quantity) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE products 
         SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING *`,
        [quantity, productId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Product not found' };
      }

      // Record transaction
      const txId = uuidv4();
      await client.query(
        `INSERT INTO inventory_transactions (id, product_id, quantity_change, transaction_type)
         VALUES ($1, $2, $3, 'restock')`,
        [txId, productId, quantity]
      );

      await client.query('COMMIT');
      
      incrementOperations('restock', 'success');
      updateStockLevel(productId, result.rows[0].name, result.rows[0].stock_quantity);

      return {
        success: true,
        product: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      incrementOperations('restock', 'error');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get service status including chaos/gremlin info
   */
  getServiceStatus() {
    return {
      gremlin: getGremlinStatus(),
      chaos: getChaosStatus()
    };
  }
}

module.exports = new InventoryService();
