# Inventory Service

Part of the Logarithm Warehouse microservices system.

## Responsibilities

- Manages product stock levels
- Processes inventory deductions
- Implements chaos simulation (Gremlin + Schrödinger)
- Supports idempotent updates
- Provides health check with dependency verification
- Exposes Prometheus metrics

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /inventory/deduct | Deduct stock for order |
| POST | /inventory/check | Check availability |
| GET | /inventory/products | List all products |
| GET | /inventory/products/:id | Get product by ID |
| POST | /inventory/products/:id/stock | Add stock |
| GET | /inventory/status | Get chaos/gremlin status |
| GET | /health | Health check |
| GET | /metrics | Prometheus metrics |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3002 | Service port |
| DATABASE_URL | - | PostgreSQL connection string |
| GREMLIN_ENABLED | true | Enable latency simulation |
| GREMLIN_EVERY_NTH_REQUEST | 5 | Delay every Nth request |
| GREMLIN_DELAY_MS | 5000 | Delay duration in ms |
| CHAOS_ENABLED | true | Enable crash simulation |
| CHAOS_CRASH_PROBABILITY | 0.1 | Probability of crash (0-1) |

## Chaos Features

### Gremlin Latency
Deterministic delay pattern - every Nth request delayed by configured duration.

### Schrödinger's Warehouse
Simulates crash after DB commit but before HTTP response:
- DB transaction commits successfully
- Service "crashes" before sending response
- Client receives error but data is saved
- Demonstrates need for idempotency
