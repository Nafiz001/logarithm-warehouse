const client = require('prom-client');

// Create a Registry
const register = client.register;

// Collect default metrics
client.collectDefaultMetrics({ register });

// Custom metrics for Inventory Service

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'inventory_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 10]
});

// Inventory operations counter
const inventoryOperations = new client.Counter({
  name: 'inventory_service_operations_total',
  help: 'Total inventory operations by type and status',
  labelNames: ['operation', 'status']
});

// Gremlin delay counter
const gremlinDelays = new client.Counter({
  name: 'inventory_service_gremlin_delays_total',
  help: 'Total number of gremlin-induced delays'
});

// Chaos events counter
const chaosEvents = new client.Counter({
  name: 'inventory_service_chaos_events_total',
  help: 'Total number of chaos (simulated crash) events'
});

// Stock level gauge
const stockLevel = new client.Gauge({
  name: 'inventory_service_stock_level',
  help: 'Current stock level by product',
  labelNames: ['product_id', 'product_name']
});

// Active requests gauge
const activeRequests = new client.Gauge({
  name: 'inventory_service_active_requests',
  help: 'Number of active requests being processed'
});

function setupMetrics() {
  console.log('Prometheus metrics initialized for Inventory Service');
}

function recordHttpRequest(method, route, statusCode, durationMs) {
  httpRequestDuration.observe(
    { method, route, status_code: statusCode },
    durationMs / 1000
  );
}

function incrementOperations(operation, status) {
  inventoryOperations.inc({ operation, status });
}

function incrementGremlinDelays() {
  gremlinDelays.inc();
}

function incrementChaosEvents() {
  chaosEvents.inc();
}

function updateStockLevel(productId, productName, quantity) {
  stockLevel.set({ product_id: productId, product_name: productName }, quantity);
}

function incrementActiveRequests() {
  activeRequests.inc();
}

function decrementActiveRequests() {
  activeRequests.dec();
}

module.exports = {
  register,
  setupMetrics,
  recordHttpRequest,
  incrementOperations,
  incrementGremlinDelays,
  incrementChaosEvents,
  updateStockLevel,
  incrementActiveRequests,
  decrementActiveRequests
};
