const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/init');
const inventoryClient = require('./inventoryClient');
const { incrementOrderCounter } = require('../utils/metrics');

/**
 * Order Service - handles order lifecycle
 */
class OrderService {
  /**
   * Create a new order
   * @param {Object} orderData - Order data with customer info and items
   * @param {string} idempotencyKey - Optional idempotency key for retry safety
   * @returns {Promise<Object>} - Created order
   */
  async createOrder(orderData, idempotencyKey = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check for existing order with same idempotency key
      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT * FROM orders WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        
        if (existing.rows.length > 0) {
          console.log(`[OrderService] Returning existing order for idempotency key: ${idempotencyKey}`);
          await client.query('COMMIT');
          incrementOrderCounter('created', 'idempotent');
          return {
            success: true,
            order: existing.rows[0],
            alreadyExists: true
          };
        }
      }

      const orderId = uuidv4();
      const { customerName, customerEmail, items } = orderData;
      
      // Calculate total
      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

      // Insert order
      const orderResult = await client.query(
        `INSERT INTO orders (id, customer_name, customer_email, status, total_amount, idempotency_key)
         VALUES ($1, $2, $3, 'pending', $4, $5)
         RETURNING *`,
        [orderId, customerName, customerEmail, totalAmount, idempotencyKey]
      );

      // Insert order items
      for (const item of items) {
        const itemId = uuidv4();
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, orderId, item.productId, item.productName, item.quantity, item.unitPrice]
        );
      }

      await client.query('COMMIT');
      
      incrementOrderCounter('created', 'success');
      console.log(`[OrderService] Created order: ${orderId}`);

      return {
        success: true,
        order: orderResult.rows[0],
        items
      };
    } catch (error) {
      await client.query('ROLLBACK');
      incrementOrderCounter('created', 'error');
      console.error('[OrderService] Error creating order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Ship an order - coordinates with Inventory Service
   * Handles partial failures and idempotency (Schrödinger's Warehouse)
   * @param {string} orderId - Order ID to ship
   * @returns {Promise<Object>} - Ship result
   */
  async shipOrder(orderId) {
    const client = await pool.connect();
    
    try {
      // Get order with items
      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      const order = orderResult.rows[0];

      // Check if already shipped
      if (order.status === 'shipped') {
        console.log(`[OrderService] Order ${orderId} already shipped`);
        return {
          success: true,
          message: 'Order already shipped',
          order
        };
      }

      // Check if inventory was already updated (Schrödinger fix)
      if (order.inventory_updated) {
        console.log(`[OrderService] Inventory already updated for ${orderId}, just updating status`);
        await client.query(
          `UPDATE orders SET status = 'shipped', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [orderId]
        );
        incrementOrderCounter('shipped', 'recovered');
        return {
          success: true,
          message: 'Order shipping completed (recovered from partial failure)',
          order: { ...order, status: 'shipped' }
        };
      }

      // Get order items
      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      const items = itemsResult.rows.map(item => ({
        productId: item.product_id,
        quantity: item.quantity
      }));

      // Call Inventory Service to deduct stock
      console.log(`[OrderService] Calling Inventory Service for order ${orderId}`);
      const inventoryResult = await inventoryClient.deductInventory(orderId, items);

      if (!inventoryResult.success && !inventoryResult.alreadyProcessed) {
        // Inventory update failed
        if (inventoryResult.timedOut) {
          incrementOrderCounter('shipped', 'timeout');
          return {
            success: false,
            error: 'Inventory service timed out',
            userMessage: 'The inventory system is currently slow. Please check your order status in a few minutes.',
            retryable: true
          };
        }

        incrementOrderCounter('shipped', 'error');
        return {
          success: false,
          error: inventoryResult.error,
          userMessage: 'Unable to process shipping at this time. Please try again.',
          retryable: inventoryResult.retryable
        };
      }

      // Mark inventory as updated first (before status change)
      // This handles the Schrödinger case - if we crash after this, we know inventory was updated
      await client.query('BEGIN');
      
      await client.query(
        `UPDATE orders SET inventory_updated = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );

      await client.query(
        `UPDATE orders SET status = 'shipped', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );

      await client.query('COMMIT');

      incrementOrderCounter('shipped', 'success');
      console.log(`[OrderService] Order ${orderId} shipped successfully`);

      return {
        success: true,
        message: 'Order shipped successfully',
        order: { ...order, status: 'shipped', inventory_updated: true },
        inventoryResult: inventoryResult.data
      };
    } catch (error) {
      incrementOrderCounter('shipped', 'error');
      console.error(`[OrderService] Error shipping order ${orderId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} - Order with items
   */
  async getOrder(orderId) {
    const client = await pool.connect();
    
    try {
      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return null;
      }

      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      return {
        ...orderResult.rows[0],
        items: itemsResult.rows
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get all orders
   * @param {number} limit - Max orders to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} - List of orders
   */
  async getAllOrders(limit = 50, offset = 0) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      
      return result.rows;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrderService();
