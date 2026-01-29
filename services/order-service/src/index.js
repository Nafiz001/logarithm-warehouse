const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { register: prometheusRegister } = require('prom-client');
const { initializeDatabase } = require('./db/init');
const { setupMetrics } = require('./utils/metrics');
const orderRoutes = require('./routes/orders');
const healthRoutes = require('./routes/health');
const inventoryClient = require('./services/inventoryClient');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Setup Prometheus metrics
setupMetrics();

// Routes
app.use('/orders', orderRoutes);
app.use('/health', healthRoutes);

// Timeout configuration endpoint (for demo purposes)
app.get('/config/timeout', (req, res) => {
  res.json({
    success: true,
    currentTimeoutMs: inventoryClient.getTimeout()
  });
});

app.post('/config/timeout', (req, res) => {
  const { timeoutMs } = req.body;
  if (!timeoutMs || typeof timeoutMs !== 'number' || timeoutMs < 1000 || timeoutMs > 30000) {
    return res.status(400).json({
      success: false,
      error: 'timeoutMs must be a number between 1000 and 30000'
    });
  }
  inventoryClient.setTimeout(timeoutMs);
  res.json({
    success: true,
    message: `Timeout updated to ${timeoutMs}ms`,
    currentTimeoutMs: inventoryClient.getTimeout()
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', prometheusRegister.contentType);
    res.end(await prometheusRegister.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'order-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      orders: '/orders',
      metrics: '/metrics'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('Initializing Order Service...');
    await initializeDatabase();
    console.log('Database initialized successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Order Service running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Metrics: http://localhost:${PORT}/metrics`);
    });
  } catch (error) {
    console.error('Failed to start Order Service:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
