const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// POST /inventory/deduct - Deduct stock for an order
router.post('/deduct', inventoryController.deductInventory);

// POST /inventory/check - Check stock availability
router.post('/check', inventoryController.checkAvailability);

// GET /inventory/products - Get all products
router.get('/products', inventoryController.getAllProducts);

// GET /inventory/products/:productId - Get product by ID
router.get('/products/:productId', inventoryController.getProduct);

// POST /inventory/products/:productId/stock - Add stock to product
router.post('/products/:productId/stock', inventoryController.addStock);

// GET /inventory/status - Get service status (gremlin/chaos)
router.get('/status', inventoryController.getStatus);

module.exports = router;
