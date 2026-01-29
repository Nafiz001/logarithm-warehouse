#!/bin/bash
# Quick health check script for all services

BASE_URL="${BASE_URL:-http://localhost}"

echo "=============================================="
echo "Logarithm Warehouse - Health Check"
echo "=============================================="
echo ""

# Check Nginx
echo "1. Nginx Load Balancer:"
nginx_health=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" --max-time 5)
if [ "$nginx_health" == "200" ]; then
    echo "   ✓ Healthy (HTTP $nginx_health)"
else
    echo "   ✗ Unhealthy (HTTP $nginx_health)"
fi

# Check Order Service
echo ""
echo "2. Order Service:"
order_health=$(curl -s "$BASE_URL/order-health" --max-time 5)
order_status=$(echo "$order_health" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$order_status" == "healthy" ]; then
    echo "   ✓ Healthy"
    echo "   Database: $(echo "$order_health" | grep -o '"connected":[^,]*' | cut -d':' -f2)"
else
    echo "   ✗ Unhealthy: $order_status"
fi

# Check Inventory Service
echo ""
echo "3. Inventory Service:"
inventory_health=$(curl -s "$BASE_URL/inventory-health" --max-time 5)
inventory_status=$(echo "$inventory_health" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$inventory_status" == "healthy" ]; then
    echo "   ✓ Healthy"
    echo "   Database: $(echo "$inventory_health" | grep -o '"connected":[^,]*' | cut -d':' -f2)"
    echo "   Products: $(echo "$inventory_health" | grep -o '"productCount":[^,]*' | cut -d':' -f2)"
else
    echo "   ✗ Unhealthy: $inventory_status"
fi

# Check Prometheus
echo ""
echo "4. Prometheus:"
prom_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9090/-/healthy" --max-time 5)
if [ "$prom_health" == "200" ]; then
    echo "   ✓ Healthy (HTTP $prom_health)"
else
    echo "   ✗ Unhealthy (HTTP $prom_health)"
fi

# Check Grafana
echo ""
echo "5. Grafana:"
grafana_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/health" --max-time 5)
if [ "$grafana_health" == "200" ]; then
    echo "   ✓ Healthy (HTTP $grafana_health)"
else
    echo "   ✗ Unhealthy (HTTP $grafana_health)"
fi

echo ""
echo "=============================================="
echo "Gremlin & Chaos Status:"
echo "=============================================="
chaos_status=$(curl -s "$BASE_URL/inventory/status" --max-time 5)
echo "Gremlin Enabled: $(echo "$chaos_status" | grep -o '"enabled":[^,]*' | head -1 | cut -d':' -f2)"
echo "Gremlin Every Nth: $(echo "$chaos_status" | grep -o '"everyNthRequest":[^,]*' | cut -d':' -f2)"
echo "Chaos Enabled: $(echo "$chaos_status" | grep -o '"enabled":[^,}]*' | tail -1 | cut -d':' -f2)"
echo ""
