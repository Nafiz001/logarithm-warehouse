#!/bin/bash
# Load testing script for Logarithm Warehouse
# Runs inside Docker to test the system under load

# Don't exit on first error - we want to track all results
set +e

BASE_URL="${BASE_URL:-http://localhost}"
NUM_ORDERS="${NUM_ORDERS:-20}"

echo "=============================================="
echo "Logarithm Warehouse - Load Test"
echo "=============================================="
echo "Base URL: $BASE_URL"
echo "Number of Orders: $NUM_ORDERS"
echo "=============================================="

# Results tracking
TOTAL_REQUESTS=0
SUCCESSFUL_ORDERS=0
FAILED_ORDERS=0
SHIPPED_SUCCESS=0
SHIPPED_FAILED=0

# Array to store order IDs
declare -a ORDER_IDS

echo ""
echo "=== Phase 1: Creating Orders ==="
echo ""

for i in $(seq 1 $NUM_ORDERS); do
    idempotency_key="test-order-$(date +%s%N)-$i"
    
    response=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST "$BASE_URL/orders" \
        -H "Content-Type: application/json" \
        -H "X-Idempotency-Key: $idempotency_key" \
        -d "{
            \"customerName\": \"Test Customer $i\",
            \"customerEmail\": \"test$i@example.com\",
            \"items\": [
                {
                    \"productId\": \"11111111-1111-1111-1111-111111111111\",
                    \"productName\": \"Gaming Console X\",
                    \"quantity\": 1,
                    \"unitPrice\": 499.99
                }
            ]
        }" --max-time 15 2>/dev/null)
    
    http_code=$(echo "$response" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_CODE:[0-9]*$//')
    
    if [ "$http_code" == "201" ] || [ "$http_code" == "200" ]; then
        order_id=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$order_id" ]; then
            ORDER_IDS+=("$order_id")
            echo "[Order $i] ✓ Created - ID: ${order_id:0:8}... (HTTP $http_code)"
            ((SUCCESSFUL_ORDERS++))
        else
            echo "[Order $i] ✗ Created but no ID returned (HTTP $http_code)"
            ((FAILED_ORDERS++))
        fi
    else
        echo "[Order $i] ✗ Failed (HTTP ${http_code:-timeout})"
        ((FAILED_ORDERS++))
    fi
    ((TOTAL_REQUESTS++))
    
    # Small delay to avoid overwhelming
    sleep 0.2
done

echo ""
echo "=== Phase 2: Shipping Orders ==="
echo "Note: Gremlin latency may cause some delays (this is expected!)"
echo ""

for i in "${!ORDER_IDS[@]}"; do
    order_id="${ORDER_IDS[$i]}"
    order_num=$((i + 1))
    
    response=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST "$BASE_URL/orders/$order_id/ship" \
        -H "Content-Type: application/json" \
        --max-time 15 2>/dev/null)
    
    http_code=$(echo "$response" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
    
    if [ "$http_code" == "200" ]; then
        echo "[Ship $order_num] ✓ Shipped (HTTP $http_code)"
        ((SHIPPED_SUCCESS++))
    elif [ "$http_code" == "503" ]; then
        echo "[Ship $order_num] ⏱ Service temporarily unavailable - retry later (HTTP $http_code)"
        ((SHIPPED_FAILED++))
    else
        echo "[Ship $order_num] ✗ Failed (HTTP ${http_code:-timeout})"
        ((SHIPPED_FAILED++))
    fi
    ((TOTAL_REQUESTS++))
    
    # Small delay
    sleep 0.2
done

echo ""
echo "=============================================="
echo "LOAD TEST RESULTS"
echo "=============================================="
echo "Total Requests: $TOTAL_REQUESTS"
echo ""
echo "Orders:"
echo "  - Created Successfully: $SUCCESSFUL_ORDERS / $NUM_ORDERS"
echo "  - Failed to Create: $FAILED_ORDERS"
echo ""
echo "Shipping:"
echo "  - Shipped Successfully: $SHIPPED_SUCCESS"
echo "  - Failed/Timeout: $SHIPPED_FAILED"
echo ""
echo "=============================================="

# Check health after load test
echo ""
echo "=== Post-Test Health Check ==="
echo ""

echo "Order Service Health:"
curl -s "$BASE_URL/order-health" 2>/dev/null | head -c 200 || echo "Failed to reach"
echo ""
echo ""

echo "Inventory Service Health:"
curl -s "$BASE_URL/inventory-health" 2>/dev/null | head -c 200 || echo "Failed to reach"
echo ""

# Calculate success - we expect at least 50% success rate with chaos/gremlin enabled
MIN_SUCCESS=$((NUM_ORDERS / 2))
echo ""
if [ $SUCCESSFUL_ORDERS -ge $MIN_SUCCESS ]; then
    echo "=============================================="
    echo "✓ LOAD TEST PASSED"
    echo "  Created $SUCCESSFUL_ORDERS/$NUM_ORDERS orders successfully"
    echo "  (Some failures are expected with chaos testing enabled)"
    echo "=============================================="
    exit 0
else
    echo "=============================================="
    echo "✗ LOAD TEST FAILED"
    echo "  Only $SUCCESSFUL_ORDERS/$NUM_ORDERS orders created"
    echo "  Minimum required: $MIN_SUCCESS"
    echo "=============================================="
    exit 1
fi
