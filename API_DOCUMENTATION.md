# 📚 API Documentation

## Logarithm Warehouse - Microservices API Reference

**Base URL (Azure VM):** `http://40.81.240.99`  
**Version:** 1.0.0  
**Last Updated:** January 29, 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Order Service API](#order-service-api)
3. [Inventory Service API](#inventory-service-api)
4. [Frontend Service](#frontend-service)
5. [Monitoring Endpoints](#monitoring-endpoints)
6. [Error Handling](#error-handling)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NGINX LOAD BALANCER                         │
│                            Port 80                                   │
├─────────────────────────────────────────────────────────────────────┤
│  /orders/*        → Order Service (3001)                            │
│  /order-health    → Order Service /health                           │
│  /order-metrics   → Order Service /metrics                          │
│  /inventory/*     → Inventory Service (3002)                        │
│  /inventory-health→ Inventory Service /health                       │
│  /inventory-metrics→ Inventory Service /metrics                     │
│  /health          → Nginx health check                              │
│  /*               → Frontend Dashboard (3000)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Order Service API

**Base Path:** `/orders`  
**Internal Port:** 3001

### Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orders` | Create a new order |
| GET | `/orders` | Get all orders |
| GET | `/orders/:orderId` | Get order by ID |
| POST | `/orders/:orderId/ship` | Ship an order (triggers inventory deduction) |
| GET | `/orders/:orderId/verify` | Verify order-inventory consistency |
| POST | `/orders/recover` | Recover pending/stuck orders |

---

### POST /orders

Create a new order.

**Headers:**
| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | `application/json` |
| `X-Idempotency-Key` | string | No | Unique key to prevent duplicate orders |

**Request Body:**
```json
{
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "items": [
    {
      "productId": "prod-001",
      "productName": "Gaming Console",
      "quantity": 2,
      "unitPrice": 499.99
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "id": "ord-abc123",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "status": "pending",
    "items": [...],
    "totalAmount": 999.98,
    "createdAt": "2026-01-29T10:30:00.000Z"
  }
}
```

**Error Responses:**
| Status | Description |
|--------|-------------|
| 400 | Invalid order data |
| 500 | Server error |

---

### GET /orders

Get all orders with pagination.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Maximum orders to return |
| `offset` | number | 0 | Number of orders to skip |

**Response (200 OK):**
```json
{
  "success": true,
  "count": 3,
  "orders": [
    {
      "id": "9b543bd6-3563-4b4d-b8d6-68b637f713cd",
      "customer_name": "Melanie Boyd",
      "customer_email": "user@example.com",
      "status": "shipped",
      "total_amount": "1399.98",
      "idempotency_key": "order-1769666014331",
      "inventory_updated": true,
      "created_at": "2026-01-29T05:53:34.229Z",
      "updated_at": "2026-01-29T05:53:37.591Z"
    }
  ]
}
```

---

### GET /orders/:orderId

Get a specific order by ID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `orderId` | string | The order ID |

**Response (200 OK):**
```json
{
  "success": true,
  "order": {
    "id": "ord-abc123",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "status": "pending",
    "items": [
      {
        "productId": "prod-001",
        "productName": "Gaming Console",
        "quantity": 2,
        "unitPrice": 499.99
      }
    ],
    "totalAmount": 999.98,
    "createdAt": "2026-01-29T10:30:00.000Z",
    "updatedAt": "2026-01-29T10:30:00.000Z"
  }
}
```

**Error Responses:**
| Status | Description |
|--------|-------------|
| 404 | Order not found |
| 500 | Server error |

---

### POST /orders/:orderId/ship

Ship an order. This triggers inventory deduction via the Inventory Service.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `orderId` | string | The order ID |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Order shipped successfully",
  "order": {
    "id": "ord-abc123",
    "status": "shipped",
    "shippedAt": "2026-01-29T11:00:00.000Z"
  }
}
```

**Error Responses:**
| Status | Description | Retryable |
|--------|-------------|-----------|
| 400 | Invalid order state | No |
| 503 | Inventory service timeout | Yes |
| 500 | Server error | Yes |

**Timeout Behavior:**
- If inventory service doesn't respond within 3 seconds, returns 503
- User receives: "Inventory service did not respond in time. Your order may still be processed."
- Order marked as `pending_inventory` for later recovery

---

### GET /orders/:orderId/verify

Verify order-inventory consistency (Schrödinger's Warehouse check).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `orderId` | string | The order ID |

**Response (200 OK):**
```json
{
  "success": true,
  "orderId": "ord-abc123",
  "orderStatus": "pending_inventory",
  "inventoryDeducted": true,
  "consistent": false,
  "recommendation": "Order inventory was deducted but order not updated. Run recovery."
}
```

---

### POST /orders/recover

Recover orders stuck in inconsistent states.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Recovery complete. Fixed 2 orders, failed 0 orders.",
  "checked": 5,
  "fixed": 2,
  "failed": 0,
  "details": [
    {
      "orderId": "ord-abc123",
      "previousStatus": "pending_inventory",
      "newStatus": "shipped",
      "action": "Inventory was already deducted, marked as shipped"
    }
  ]
}
```

---

## Inventory Service API

**Base Path:** `/inventory`  
**Internal Port:** 3002

### Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/inventory/products` | Get all products |
| GET | `/inventory/products/:productId` | Get product by ID |
| POST | `/inventory/products/:productId/stock` | Add stock to product |
| POST | `/inventory/check` | Check stock availability |
| POST | `/inventory/deduct` | Deduct inventory (idempotent) |
| GET | `/inventory/transactions/order/:orderId` | Get transactions for order |
| GET | `/inventory/status` | Get service status (gremlin/chaos) |

---

### GET /inventory/products

Get all products in inventory.

**Response (200 OK):**
```json
{
  "success": true,
  "count": 8,
  "products": [
    {
      "id": "44444444-4444-4444-4444-444444444444",
      "name": "4K Gaming Monitor",
      "description": "High quality 4K Gaming Monitor",
      "price": "699.99",
      "stock_quantity": 73,
      "created_at": "2026-01-29T04:38:48.583Z",
      "updated_at": "2026-01-29T05:53:37.585Z"
    }
  ]
}
```

---

### GET /inventory/products/:productId

Get a specific product by ID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `productId` | string | The product ID |

**Response (200 OK):**
```json
{
  "success": true,
  "product": {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "4K Gaming Monitor",
    "description": "High quality 4K Gaming Monitor",
    "price": "699.99",
    "stock_quantity": 73,
    "created_at": "2026-01-29T04:38:48.583Z",
    "updated_at": "2026-01-29T05:53:37.585Z"
  }
}
```

**Error Responses:**
| Status | Description |
|--------|-------------|
| 404 | Product not found |
| 500 | Server error |

---

### POST /inventory/products/:productId/stock

Add stock to a product.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `productId` | string | The product ID |

**Request Body:**
```json
{
  "quantity": 50
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Stock added successfully",
  "product": {
    "id": "prod-001",
    "name": "Gaming Console",
    "previousQuantity": 150,
    "addedQuantity": 50,
    "newQuantity": 200
  }
}
```

**Error Responses:**
| Status | Description |
|--------|-------------|
| 400 | Invalid quantity (must be positive) |
| 404 | Product not found |
| 500 | Server error |

---

### POST /inventory/check

Check stock availability for items.

**Request Body:**
```json
{
  "items": [
    { "productId": "prod-001", "quantity": 5 },
    { "productId": "prod-002", "quantity": 3 }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "available": true,
  "items": [
    {
      "productId": "prod-001",
      "requested": 5,
      "available": 140,
      "sufficient": true
    },
    {
      "productId": "prod-002",
      "requested": 3,
      "available": 50,
      "sufficient": true
    }
  ]
}
```

---

### POST /inventory/deduct

Deduct inventory for an order. **Idempotent** - safe to retry.

**Request Body:**
```json
{
  "orderId": "ord-abc123",
  "idempotencyKey": "order-ord-abc123",
  "items": [
    { "productId": "prod-001", "quantity": 2 },
    { "productId": "prod-002", "quantity": 1 }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Inventory deducted successfully",
  "data": {
    "orderId": "ord-abc123",
    "transactionId": "txn-xyz789",
    "items": [
      { "productId": "prod-001", "deducted": 2, "remaining": 138 }
    ]
  }
}
```

**Response (409 Conflict - Already Processed):**
```json
{
  "success": true,
  "alreadyProcessed": true,
  "message": "This order has already been processed"
}
```

**Chaos Event Response (500):**
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "The inventory update may have succeeded. Please verify order status.",
  "chaosEvent": true
}
```

---

### GET /inventory/transactions/order/:orderId

Get inventory transactions for an order (Schrödinger recovery helper).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `orderId` | string | The order ID |

**Response (200 OK):**
```json
{
  "success": true,
  "found": true,
  "orderId": "ord-abc123",
  "transactions": [
    {
      "id": "txn-xyz789",
      "orderId": "ord-abc123",
      "type": "deduction",
      "items": [...],
      "createdAt": "2026-01-29T11:00:00.000Z",
      "completed": true
    }
  ]
}
```

---

### GET /inventory/status

Get service simulation status (gremlin latency and chaos mode).

**Response (200 OK):**
```json
{
  "success": true,
  "gremlin": {
    "enabled": true,
    "everyNthRequest": 5,
    "delayMs": 5000,
    "currentRequestCount": 42,
    "nextDelayIn": 3
  },
  "chaos": {
    "enabled": true,
    "crashProbability": 0.1
  }
}
```

---

## Frontend Service

**Base Path:** `/`  
**Internal Port:** 3000

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve dashboard SPA |
| GET | `/health` | Frontend health check |
| GET | `/*` | Catch-all for SPA routing |

---

### GET /health

Frontend health check.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "warehouse-dashboard"
}
```

---

## Monitoring Endpoints

### Health Checks

| Endpoint | Service | Description |
|----------|---------|-------------|
| `/health` | Nginx | Load balancer health |
| `/order-health` | Order Service | Includes DB + downstream checks |
| `/inventory-health` | Inventory Service | Includes DB + gremlin/chaos status |

### Prometheus Metrics

| Endpoint | Service | Description |
|----------|---------|-------------|
| `/order-metrics` | Order Service | HTTP requests, latencies, active requests |
| `/inventory-metrics` | Inventory Service | HTTP requests, latencies, inventory calls |
| `:9090` | Prometheus | Prometheus UI |
| `:3000` | Grafana | Grafana dashboards (admin/admin) |

---

### GET /order-health

Comprehensive Order Service health check.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "order-service",
  "timestamp": "2026-01-29T12:00:00.000Z",
  "responseTimeMs": 45,
  "checks": {
    "database": {
      "status": "healthy",
      "connected": true,
      "tablesExist": true,
      "tables": ["orders", "order_items", "idempotency_keys"]
    },
    "inventoryService": {
      "status": "healthy",
      "healthy": true,
      "responseTimeMs": 23
    }
  },
  "uptime": 86400,
  "memoryUsage": {
    "heapUsed": 45000000,
    "heapTotal": 70000000
  }
}
```

---

### GET /inventory-health

Comprehensive Inventory Service health check.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "inventory-service",
  "timestamp": "2026-01-29T12:00:00.000Z",
  "responseTimeMs": 12,
  "checks": {
    "database": {
      "status": "healthy",
      "connected": true,
      "tablesExist": true,
      "tables": ["products", "inventory_transactions"],
      "productCount": 8
    }
  },
  "simulation": {
    "gremlin": {
      "enabled": true,
      "everyNthRequest": 5,
      "delayMs": 5000
    },
    "chaos": {
      "enabled": true,
      "crashProbability": 0.1
    }
  },
  "uptime": 86400
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "Brief error description",
  "message": "User-friendly message",
  "retryable": true
}
```

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | - |
| 201 | Created | Resource created |
| 400 | Bad Request | Fix request data |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Idempotent replay (already processed) |
| 500 | Server Error | Retry if `retryable: true` |
| 503 | Service Unavailable | Downstream timeout, retry later |

---

## Environment Variables

### Order Service
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Service port |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `INVENTORY_SERVICE_URL` | `http://nginx:80/inventory` | Inventory service URL |
| `REQUEST_TIMEOUT_MS` | 3000 | Timeout for inventory calls |

### Inventory Service
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3002 | Service port |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `GREMLIN_ENABLED` | false | Enable latency simulation |
| `GREMLIN_EVERY_NTH_REQUEST` | 5 | Delay every Nth request |
| `GREMLIN_DELAY_MS` | 5000 | Delay duration in ms |
| `CHAOS_ENABLED` | false | Enable crash simulation |
| `CHAOS_CRASH_PROBABILITY` | 0.1 | Crash probability (0-1) |

---

## Quick Test Commands

```powershell
# Health checks
curl http://40.81.240.99/health
curl http://40.81.240.99/order-health
curl http://40.81.240.99/inventory-health

# Get all orders
curl http://40.81.240.99/orders

# Get all products
curl http://40.81.240.99/inventory/products

# Create an order
curl -X POST http://40.81.240.99/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","items":[{"productId":"prod-001","productName":"Test Product","quantity":1,"unitPrice":99.99}]}'

# Ship an order
curl -X POST http://40.81.240.99/orders/{orderId}/ship

# Check gremlin/chaos status
curl http://40.81.240.99/inventory/status

# Recover stuck orders
curl -X POST http://40.81.240.99/orders/recover
```

---

## Architecture Resilience Features

### 1. Gremlin Latency (Vanishing Response)
- Simulates network delays
- Every 5th request gets 5 second delay
- Order service handles via timeout

### 2. Chaos Mode (Schrödinger's Warehouse)
- 10% chance of crash after DB commit
- Simulates partial failures
- Recovery endpoint fixes inconsistencies

### 3. Idempotency
- Orders use `X-Idempotency-Key` header
- Inventory deductions use order ID as key
- Safe to retry any operation

### 4. Health Checks
- Each service checks its database
- Order service checks inventory service
- Proper 503 on degradation

---

*Documentation generated for BUET CSE Fest 2026 - Team Logarithm*
