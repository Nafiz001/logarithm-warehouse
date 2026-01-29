const inventoryService = require('../services/inventoryService');
const { recordHttpRequest, incrementActiveRequests, decrementActiveRequests } = require('../utils/metrics');

/**
 * Deduct inventory for an order
 */
async function deductInventory(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { orderId, idempotencyKey, items } = req.body;

    if (!orderId || !items || !Array.isArray(items) || items.length === 0) {
      recordHttpRequest('POST', '/inventory/deduct', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'orderId and items array are required'
      });
    }

    const key = idempotencyKey || `order-${orderId}`;
    const result = await inventoryService.deductInventory(orderId, key, items);

    // If already processed, return 409 to signal idempotent replay
    if (result.alreadyProcessed) {
      recordHttpRequest('POST', '/inventory/deduct', 409, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(409).json({
        success: true,
        alreadyProcessed: true,
        message: result.message
      });
    }

    recordHttpRequest('POST', '/inventory/deduct', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      message: 'Inventory deducted successfully',
      data: result
    });
  } catch (error) {
    recordHttpRequest('POST', '/inventory/deduct', 500, Date.now() - startTime);
    decrementActiveRequests();

    // Check if this is a chaos-induced crash
    if (error.isChaosEvent) {
      console.error('[Controller] Chaos event triggered - simulating crash');
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'The inventory update may have succeeded. Please verify order status.',
        chaosEvent: true
      });
    }

    console.error('Error in deductInventory controller:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to deduct inventory'
    });
  }
}

/**
 * Check inventory availability
 */
async function checkAvailability(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      recordHttpRequest('POST', '/inventory/check', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'items array is required'
      });
    }

    const result = await inventoryService.checkAvailability(items);

    recordHttpRequest('POST', '/inventory/check', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    recordHttpRequest('POST', '/inventory/check', 500, Date.now() - startTime);
    decrementActiveRequests();

    console.error('Error in checkAvailability controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check availability'
    });
  }
}

/**
 * Get all products
 */
async function getAllProducts(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const products = await inventoryService.getAllProducts();

    recordHttpRequest('GET', '/inventory/products', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    recordHttpRequest('GET', '/inventory/products', 500, Date.now() - startTime);
    decrementActiveRequests();

    console.error('Error in getAllProducts controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get products'
    });
  }
}

/**
 * Get product by ID
 */
async function getProduct(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { productId } = req.params;
    const product = await inventoryService.getProduct(productId);

    if (!product) {
      recordHttpRequest('GET', '/inventory/products/:id', 404, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    recordHttpRequest('GET', '/inventory/products/:id', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    recordHttpRequest('GET', '/inventory/products/:id', 500, Date.now() - startTime);
    decrementActiveRequests();

    console.error('Error in getProduct controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get product'
    });
  }
}

/**
 * Add stock to a product
 */
async function addStock(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      recordHttpRequest('POST', '/inventory/products/:id/stock', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'Positive quantity is required'
      });
    }

    const result = await inventoryService.addStock(productId, quantity);

    if (!result.success) {
      recordHttpRequest('POST', '/inventory/products/:id/stock', 404, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(404).json(result);
    }

    recordHttpRequest('POST', '/inventory/products/:id/stock', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json(result);
  } catch (error) {
    recordHttpRequest('POST', '/inventory/products/:id/stock', 500, Date.now() - startTime);
    decrementActiveRequests();

    console.error('Error in addStock controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add stock'
    });
  }
}

/**
 * Get service status (gremlin/chaos info)
 */
async function getStatus(req, res) {
  const status = await inventoryService.getServiceStatus();
  return res.status(200).json({
    success: true,
    ...status
  });
}

/**
 * Get transactions for a specific order (Schrödinger recovery)
 */
async function getOrderTransactions(req, res) {
  const startTime = Date.now();
  incrementActiveRequests();

  try {
    const { orderId } = req.params;

    if (!orderId) {
      recordHttpRequest('GET', '/inventory/transactions/order/:orderId', 400, Date.now() - startTime);
      decrementActiveRequests();
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const result = await inventoryService.getTransactionsByOrderId(orderId);

    recordHttpRequest('GET', '/inventory/transactions/order/:orderId', 200, Date.now() - startTime);
    decrementActiveRequests();

    return res.status(200).json({
      success: true,
      found: result.length > 0,
      orderId,
      transactions: result
    });
  } catch (error) {
    recordHttpRequest('GET', '/inventory/transactions/order/:orderId', 500, Date.now() - startTime);
    decrementActiveRequests();

    console.error('Error in getOrderTransactions controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get order transactions'
    });
  }
}

module.exports = {
  deductInventory,
  checkAvailability,
  getAllProducts,
  getProduct,
  addStock,
  getStatus,
  getOrderTransactions
};
