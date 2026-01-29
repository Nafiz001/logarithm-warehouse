const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// POST /orders/recover - Recover pending orders (Schrödinger's Warehouse)
// Must be before /:orderId routes to avoid matching
router.post('/recover', orderController.recoverPendingOrders);

// POST /orders - Create a new order
router.post('/', orderController.createOrder);

// GET /orders - Get all orders
router.get('/', orderController.getAllOrders);

// GET /orders/:orderId - Get order by ID
router.get('/:orderId', orderController.getOrder);

// GET /orders/:orderId/verify - Verify order inventory consistency
router.get('/:orderId/verify', orderController.verifyOrder);

// POST /orders/:orderId/ship - Ship an order
router.post('/:orderId/ship', orderController.shipOrder);

module.exports = router;
