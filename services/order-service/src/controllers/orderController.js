const orderService = require('../services/orderService');
const { recordHttpRequest, incrementActiveRequests, decrementActiveRequests } = require('../utils/metrics');

/**
 * Create a new order
 */
async function createOrder(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { customerName, customerEmail, items } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'];

    // Validate request
    if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
      recordHttpRequest('POST', '/orders', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'Invalid order data. customerName and items are required.'
      });
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.productName || !item.quantity || !item.unitPrice) {
        recordHttpRequest('POST', '/orders', 400, Date.now() - startTime);
        decrementActiveRequests();
        return res.status(400).json({
          success: false,
          error: 'Each item must have productId, productName, quantity, and unitPrice'
        });
      }
    }

    const result = await orderService.createOrder(
      { customerName, customerEmail, items },
      idempotencyKey
    );

    recordHttpRequest('POST', '/orders', 201, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(201).json({
      success: true,
      message: result.alreadyExists ? 'Order already exists (idempotent)' : 'Order created successfully',
      order: result.order
    });
  } catch (error) {
    console.error('Error in createOrder controller:', error);
    recordHttpRequest('POST', '/orders', 500, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: 'An unexpected error occurred. Please try again.'
    });
  }
}

/**
 * Ship an order
 */
async function shipOrder(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { orderId } = req.params;

    if (!orderId) {
      recordHttpRequest('POST', '/orders/:id/ship', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const result = await orderService.shipOrder(orderId);

    if (!result.success) {
      const statusCode = result.retryable ? 503 : 400;
      recordHttpRequest('POST', '/orders/:id/ship', statusCode, Date.now() - startTime);
      decrementActiveRequests();

      return res.status(statusCode).json({
        success: false,
        error: result.error,
        message: result.userMessage || result.error,
        retryable: result.retryable
      });
    }

    recordHttpRequest('POST', '/orders/:id/ship', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      message: result.message,
      order: result.order
    });
  } catch (error) {
    console.error('Error in shipOrder controller:', error);
    recordHttpRequest('POST', '/orders/:id/ship', 500, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(500).json({
      success: false,
      error: 'Failed to ship order',
      message: 'An unexpected error occurred. Please try again.'
    });
  }
}

/**
 * Get order by ID
 */
async function getOrder(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { orderId } = req.params;
    const order = await orderService.getOrder(orderId);

    if (!order) {
      recordHttpRequest('GET', '/orders/:id', 404, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    recordHttpRequest('GET', '/orders/:id', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error in getOrder controller:', error);
    recordHttpRequest('GET', '/orders/:id', 500, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(500).json({
      success: false,
      error: 'Failed to get order'
    });
  }
}

/**
 * Get all orders
 */
async function getAllOrders(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const orders = await orderService.getAllOrders(limit, offset);

    recordHttpRequest('GET', '/orders', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Error in getAllOrders controller:', error);
    recordHttpRequest('GET', '/orders', 500, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(500).json({
      success: false,
      error: 'Failed to get orders'
    });
  }
}

/**
 * Recover pending orders (Schrödinger's Warehouse)
 * POST /orders/recover
 * Finds orders stuck in inconsistent state and fixes them
 */
async function recoverPendingOrders(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const result = await orderService.recoverPendingOrders();

    recordHttpRequest('POST', '/orders/recover', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      message: `Recovery complete. Fixed ${result.fixed} orders, failed ${result.failed} orders.`,
      ...result
    });
  } catch (error) {
    console.error('Error in recoverPendingOrders controller:', error);
    recordHttpRequest('POST', '/orders/recover', 500, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(500).json({
      success: false,
      error: 'Failed to recover pending orders',
      message: error.message
    });
  }
}

/**
 * Verify order inventory consistency
 * GET /orders/:orderId/verify
 * Checks if order's inventory state matches across services
 */
async function verifyOrder(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { orderId } = req.params;

    if (!orderId) {
      recordHttpRequest('GET', '/orders/:id/verify', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const result = await orderService.verifyOrderInventory(orderId);

    recordHttpRequest('GET', '/orders/:id/verify', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error in verifyOrder controller:', error);
    recordHttpRequest('GET', '/orders/:id/verify', 500, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(500).json({
      success: false,
      error: 'Failed to verify order',
      message: error.message
    });
  }
}

module.exports = {
  createOrder,
  shipOrder,
  getOrder,
  getAllOrders,
  recoverPendingOrders,
  verifyOrder
};
