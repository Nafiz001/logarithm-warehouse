const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { register: prometheusRegister } = require('prom-client');
const { initializeDatabase } = require('./db/init');
const { setupMetrics } = require('./utils/metrics');
const inventoryRoutes = require('./routes/inventory');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Setup Prometheus metrics
setupMetrics();

// Routes
app.use('/inventory', inventoryRoutes);
app.use('/health', healthRoutes);

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
    service: 'inventory-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      inventory: '/inventory',
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
    console.log('Initializing Inventory Service...');
    await initializeDatabase();
    console.log('Database initialized successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Inventory Service running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Metrics: http://localhost:${PORT}/metrics`);
      console.log(`Gremlin Latency: ${process.env.GREMLIN_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
      console.log(`Chaos Mode: ${process.env.CHAOS_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
    });
  } catch (error) {
    console.error('Failed to start Inventory Service:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
