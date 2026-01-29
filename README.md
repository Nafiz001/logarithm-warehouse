# Logarithm Warehouse

**BUET CSE Fest 2026 – Microservices & DevOps Hackathon**  
**Team: Logarithm**

A production-realistic microservice backend demonstrating resilience, horizontal scalability, and observability.

## 🏗️ Architecture

```
                    ┌─────────────────┐
                    │     Nginx       │
                    │  Load Balancer  │
                    │    (port 80)    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼─────────┐       ┌──────────▼──────────┐
    │   Order Service   │──────▶│  Inventory Service  │
    │    (port 3001)    │       │     (port 3002)     │
    └─────────┬─────────┘       └──────────┬──────────┘
              │                            │
    ┌─────────▼─────────┐       ┌──────────▼──────────┐
    │    Order DB       │       │   Inventory DB      │
    │   (PostgreSQL)    │       │   (PostgreSQL)      │
    └───────────────────┘       └─────────────────────┘
              
              ┌─────────────────────────────┐
              │         Monitoring          │
              │  Prometheus + Grafana       │
              └─────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose v2+

### Start the System

```bash
# Build and start all services
docker compose up --build -d

# View logs
docker compose logs -f

# Check health
curl http://localhost/health
curl http://localhost/order-health
curl http://localhost/inventory-health
```

### Access Points

| Service | URL |
|---------|-----|
| API Gateway (Nginx) | http://localhost |
| Order Service Health | http://localhost/order-health |
| Inventory Service Health | http://localhost/inventory-health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 (admin/admin) |

## 📋 API Endpoints

### Order Service

```bash
# Create an order
curl -X POST http://localhost/orders \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: unique-key-123" \
  -d '{
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "items": [
      {
        "productId": "11111111-1111-1111-1111-111111111111",
        "productName": "Gaming Console X",
        "quantity": 1,
        "unitPrice": 499.99
      }
    ]
  }'

# Get all orders
curl http://localhost/orders

# Get order by ID
curl http://localhost/orders/{orderId}

# Ship an order (triggers inventory deduction)
curl -X POST http://localhost/orders/{orderId}/ship
```

### Inventory Service

```bash
# Get all products
curl http://localhost/inventory/products

# Check availability
curl -X POST http://localhost/inventory/check \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"productId": "11111111-1111-1111-1111-111111111111", "quantity": 1}
    ]
  }'

# Get chaos/gremlin status
curl http://localhost/inventory/status
```

## 🎭 Failure Simulation

### Gremlin Latency
The Inventory Service introduces deterministic latency:
- Every **5th request** is delayed by **5 seconds**
- Order Service has a **3 second timeout** and will fail fast

Configure via environment variables:
```yaml
GREMLIN_ENABLED: "true"
GREMLIN_EVERY_NTH_REQUEST: 5
GREMLIN_DELAY_MS: 5000
```

### Schrödinger's Warehouse (Partial Failures)
Simulates crashes after DB commit but before HTTP response:
- **10% probability** of simulated crash
- Demonstrates idempotency handling
- Order Service detects and recovers from partial failures

Configure via environment variables:
```yaml
CHAOS_ENABLED: "true"
CHAOS_CRASH_PROBABILITY: 0.1
```

### Idempotency Protection
- Use `X-Idempotency-Key` header for safe retries
- Inventory deductions are tracked by order ID
- Duplicate requests are detected and handled gracefully

## 📊 Scaling

```bash
# Scale Order Service to 3 replicas
docker compose up -d --scale order-service=3

# Scale Inventory Service to 2 replicas
docker compose up -d --scale inventory-service=2

# Scale both
docker compose up -d --scale order-service=3 --scale inventory-service=2
```

## 🔍 Monitoring

### Grafana Dashboard
Access at http://localhost:3000 (admin/admin)

Features:
- **Response Time Alert**: Turns RED if avg > 1s over 30s window
- **Request Latency Graphs**: p50/p95 for both services
- **Order Status Tracking**: Created, shipped, failed counts
- **Chaos Event Monitoring**: Gremlin delays and chaos crashes

### Prometheus Metrics
Access at http://localhost:9090

Key metrics:
- `order_service_http_request_duration_seconds` - Request latency
- `order_service_response_time_seconds` - Rolling average response time
- `inventory_service_gremlin_delays_total` - Gremlin delay count
- `inventory_service_chaos_events_total` - Chaos crash count

## 🧪 Testing

### Run Load Test
```bash
# Using the test script (requires bash)
./scripts/test-load.sh

# Or with Docker
docker run --rm --network host curlimages/curl:latest \
  sh -c 'for i in $(seq 1 10); do curl -s http://localhost/orders; done'
```

### Health Check
```bash
./scripts/health-check.sh
```

## 🔧 Development

### Project Structure
```
├── services/
│   ├── order-service/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── db/
│   │   │   └── utils/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── inventory-service/
│       ├── src/
│       │   ├── controllers/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── db/
│       │   └── utils/
│       ├── Dockerfile
│       └── package.json
│
├── infra/
│   ├── nginx/nginx.conf
│   └── monitoring/
│       ├── prometheus.yml
│       └── grafana/
│
├── scripts/
│   ├── test-load.sh
│   └── health-check.sh
│
├── docker-compose.yml
└── .github/workflows/
    ├── ci.yml
    └── cd.yml
```

### Stop Everything
```bash
docker compose down -v  # -v removes volumes (data)
```

## 🚢 CI/CD

### Continuous Integration
- Runs on every push to `main` and `develop`
- Lints code
- Builds Docker images
- Runs integration tests with chaos enabled

### Continuous Deployment
- Triggers on push to `main`
- Builds and pushes images to GitHub Container Registry
- Deploys to Azure VM via SSH

## 📝 License

MIT License - BUET CSE Fest 2026 Hackathon Project
