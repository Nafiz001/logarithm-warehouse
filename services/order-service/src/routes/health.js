const express = require('express');
const router = express.Router();
const { checkDatabaseHealth } = require('../db/init');
const inventoryClient = require('../services/inventoryClient');

/**
 * Health check endpoint that verifies downstream dependencies
 * Returns detailed health status for monitoring
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    // Check inventory service health (non-blocking)
    let inventoryHealth = { healthy: false, error: 'Not checked' };
    try {
      inventoryHealth = await inventoryClient.checkHealth();
    } catch (err) {
      inventoryHealth = { healthy: false, error: err.message };
    }

    const isHealthy = dbHealth.connected && dbHealth.tablesExist;
    const responseTime = Date.now() - startTime;

    const healthResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'order-service',
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      checks: {
        database: {
          status: dbHealth.connected && dbHealth.tablesExist ? 'healthy' : 'unhealthy',
          connected: dbHealth.connected,
          tablesExist: dbHealth.tablesExist,
          tables: dbHealth.tables,
          error: dbHealth.error
        },
        inventoryService: {
          status: inventoryHealth.healthy ? 'healthy' : 'degraded',
          ...inventoryHealth
        }
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };

    if (!isHealthy) {
      return res.status(503).json(healthResponse);
    }

    return res.status(200).json(healthResponse);
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(503).json({
      status: 'unhealthy',
      service: 'order-service',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Liveness probe - simple check that the service is running
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    service: 'order-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe - checks if service is ready to accept traffic
 */
router.get('/ready', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    if (dbHealth.connected && dbHealth.tablesExist) {
      return res.status(200).json({
        status: 'ready',
        service: 'order-service',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(503).json({
      status: 'not ready',
      service: 'order-service',
      reason: 'Database not ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'not ready',
      service: 'order-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
