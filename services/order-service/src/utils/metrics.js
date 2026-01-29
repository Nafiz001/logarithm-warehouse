const client = require('prom-client');

// Create a Registry
const register = client.register;

// Collect default metrics
client.collectDefaultMetrics({ register });

// Custom metrics for Order Service

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'order_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5]
});

// Order counter
const orderCounter = new client.Counter({
  name: 'order_service_orders_total',
  help: 'Total number of orders by operation and status',
  labelNames: ['operation', 'status']
});

// Inventory service call metrics
const inventoryCallDuration = new client.Histogram({
  name: 'order_service_inventory_call_duration_seconds',
  help: 'Duration of calls to Inventory Service',
  labelNames: ['success', 'timeout'],
  buckets: [0.1, 0.5, 1, 2, 3, 5, 10]
});

// Active requests gauge
const activeRequests = new client.Gauge({
  name: 'order_service_active_requests',
  help: 'Number of active requests being processed'
});

// Response time for alerting (rolling average)
const responseTimeGauge = new client.Gauge({
  name: 'order_service_response_time_seconds',
  help: 'Current average response time in seconds'
});

// Sliding window for response time calculation
const responseTimeWindow = [];
const WINDOW_SIZE_MS = 30000; // 30 seconds

function setupMetrics() {
  console.log('Prometheus metrics initialized for Order Service');
}

function recordHttpRequest(method, route, statusCode, durationMs) {
  httpRequestDuration.observe(
    { method, route, status_code: statusCode },
    durationMs / 1000
  );

  // Update sliding window
  const now = Date.now();
  responseTimeWindow.push({ time: now, duration: durationMs });
  
  // Remove old entries
  while (responseTimeWindow.length > 0 && responseTimeWindow[0].time < now - WINDOW_SIZE_MS) {
    responseTimeWindow.shift();
  }

  // Calculate and update average
  if (responseTimeWindow.length > 0) {
    const avg = responseTimeWindow.reduce((sum, r) => sum + r.duration, 0) / responseTimeWindow.length;
    responseTimeGauge.set(avg / 1000);
  }
}

function incrementOrderCounter(operation, status) {
  orderCounter.inc({ operation, status });
}

function recordInventoryCallMetrics(durationMs, success, timedOut) {
  inventoryCallDuration.observe(
    { success: success.toString(), timeout: timedOut.toString() },
    durationMs / 1000
  );
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
  incrementOrderCounter,
  recordInventoryCallMetrics,
  incrementActiveRequests,
  decrementActiveRequests,
  responseTimeGauge
};
