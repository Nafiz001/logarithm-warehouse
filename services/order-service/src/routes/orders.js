const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// POST /orders - Create a new order
router.post('/', orderController.createOrder);

// GET /orders - Get all orders
router.get('/', orderController.getAllOrders);

// GET /orders/:orderId - Get order by ID
router.get('/:orderId', orderController.getOrder);

// POST /orders/:orderId/ship - Ship an order
router.post('/:orderId/ship', orderController.shipOrder);

module.exports = router;
