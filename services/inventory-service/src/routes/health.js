const express = require('express');
const router = express.Router();
const { checkDatabaseHealth } = require('../db/init');
const inventoryService = require('../services/inventoryService');

/**
 * Health check endpoint that verifies downstream dependencies
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    const isHealthy = dbHealth.connected && dbHealth.tablesExist;
    const responseTime = Date.now() - startTime;

    // Get service status (gremlin/chaos)
    const serviceStatus = inventoryService.getServiceStatus();

    const healthResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'inventory-service',
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      checks: {
        database: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          connected: dbHealth.connected,
          tablesExist: dbHealth.tablesExist,
          tables: dbHealth.tables,
          productCount: dbHealth.productCount,
          error: dbHealth.error
        }
      },
      simulation: {
        gremlin: serviceStatus.gremlin,
        chaos: serviceStatus.chaos
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
      service: 'inventory-service',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Liveness probe
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    service: 'inventory-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe
 */
router.get('/ready', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    if (dbHealth.connected && dbHealth.tablesExist) {
      return res.status(200).json({
        status: 'ready',
        service: 'inventory-service',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(503).json({
      status: 'not ready',
      service: 'inventory-service',
      reason: 'Database not ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'not ready',
      service: 'inventory-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
