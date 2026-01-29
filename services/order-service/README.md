# Order Service

Part of the Logarithm Warehouse microservices system.

## Responsibilities

- Accepts and validates customer orders
- Coordinates order workflow (create → ship)
- Calls Inventory Service when shipping
- Handles timeouts gracefully (3s timeout)
- Provides health check with dependency verification
- Exposes Prometheus metrics

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /orders | Create new order |
| GET | /orders | List all orders |
| GET | /orders/:id | Get order by ID |
| POST | /orders/:id/ship | Ship an order |
| GET | /health | Health check |
| GET | /metrics | Prometheus metrics |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Service port |
| DATABASE_URL | - | PostgreSQL connection string |
| INVENTORY_SERVICE_URL | http://nginx:80/inventory | Inventory service URL |
| REQUEST_TIMEOUT_MS | 3000 | Timeout for inventory calls |

## Schrödinger's Warehouse Protection

This service implements idempotency protection:

1. **Idempotency Keys**: Use `X-Idempotency-Key` header for safe retries
2. **Inventory Flag**: Tracks if inventory was updated before status change
3. **Recovery Logic**: Detects and completes partial failures
