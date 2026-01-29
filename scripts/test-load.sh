#!/bin/bash
# Load testing script for Logarithm Warehouse
# Runs inside Docker to test the system under load

set -e

BASE_URL="${BASE_URL:-http://localhost}"
NUM_ORDERS="${NUM_ORDERS:-20}"
CONCURRENT="${CONCURRENT:-5}"

echo "=============================================="
echo "Logarithm Warehouse - Load Test"
echo "=============================================="
echo "Base URL: $BASE_URL"
echo "Number of Orders: $NUM_ORDERS"
echo "Concurrency: $CONCURRENT"
echo "=============================================="

# Results tracking
TOTAL_REQUESTS=0
SUCCESSFUL_ORDERS=0
FAILED_ORDERS=0
TIMEOUTS=0
SHIPPED_SUCCESS=0
SHIPPED_FAILED=0

# Create order function
create_order() {
    local order_num=$1
    local idempotency_key="test-order-$(date +%s)-$order_num"
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/orders" \
        -H "Content-Type: application/json" \
        -H "X-Idempotency-Key: $idempotency_key" \
        -d '{
            "customerName": "Test Customer '$order_num'",
            "customerEmail": "test'$order_num'@example.com",
            "items": [
                {
                    "productId": "11111111-1111-1111-1111-111111111111",
                    "productName": "Gaming Console X",
                    "quantity": 1,
                    "unitPrice": 499.99
                }
            ]
        }' --max-time 10 2>/dev/null || echo -e "\n000")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" == "201" ] || [ "$http_code" == "200" ]; then
        echo "[Order $order_num] ✓ Created (HTTP $http_code)"
        echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4
        return 0
    elif [ "$http_code" == "000" ]; then
        echo "[Order $order_num] ⏱ Timeout"
        return 1
    else
        echo "[Order $order_num] ✗ Failed (HTTP $http_code)"
        return 1
    fi
}

# Ship order function
ship_order() {
    local order_id=$1
    local order_num=$2
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/orders/$order_id/ship" \
        -H "Content-Type: application/json" \
        --max-time 10 2>/dev/null || echo -e "\n000")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" == "200" ]; then
        echo "[Ship $order_num] ✓ Shipped (HTTP $http_code)"
        return 0
    elif [ "$http_code" == "503" ]; then
        echo "[Ship $order_num] ⏱ Timeout/Retry (HTTP $http_code)"
        echo "$body" | grep -o '"message":"[^"]*"' || true
        return 2
    elif [ "$http_code" == "000" ]; then
        echo "[Ship $order_num] ⏱ Connection Timeout"
        return 2
    else
        echo "[Ship $order_num] ✗ Failed (HTTP $http_code)"
        return 1
    fi
}

echo ""
echo "=== Phase 1: Creating Orders ==="
echo ""

ORDER_IDS=()
for i in $(seq 1 $NUM_ORDERS); do
    order_id=$(create_order $i)
    if [ $? -eq 0 ] && [ -n "$order_id" ]; then
        ORDER_IDS+=("$order_id")
        ((SUCCESSFUL_ORDERS++))
    else
        ((FAILED_ORDERS++))
    fi
    ((TOTAL_REQUESTS++))
    
    # Small delay to avoid overwhelming
    sleep 0.1
done

echo ""
echo "=== Phase 2: Shipping Orders ==="
echo "Note: Gremlin latency and chaos events may cause some failures"
echo ""

for i in "${!ORDER_IDS[@]}"; do
    order_id="${ORDER_IDS[$i]}"
    order_num=$((i + 1))
    
    ship_order "$order_id" "$order_num"
    result=$?
    
    if [ $result -eq 0 ]; then
        ((SHIPPED_SUCCESS++))
    elif [ $result -eq 2 ]; then
        ((TIMEOUTS++))
    else
        ((SHIPPED_FAILED++))
    fi
    ((TOTAL_REQUESTS++))
    
    # Small delay
    sleep 0.1
done

echo ""
echo "=============================================="
echo "LOAD TEST RESULTS"
echo "=============================================="
echo "Total Requests: $TOTAL_REQUESTS"
echo ""
echo "Orders:"
echo "  - Created: $SUCCESSFUL_ORDERS"
echo "  - Failed to Create: $FAILED_ORDERS"
echo ""
echo "Shipping:"
echo "  - Shipped: $SHIPPED_SUCCESS"
echo "  - Timeouts/Retryable: $TIMEOUTS"
echo "  - Failed: $SHIPPED_FAILED"
echo ""
echo "=============================================="

# Check health after load test
echo ""
echo "=== Post-Test Health Check ==="
echo ""

echo "Order Service Health:"
curl -s "$BASE_URL/order-health" | head -c 500
echo ""

echo ""
echo "Inventory Service Health:"
curl -s "$BASE_URL/inventory-health" | head -c 500
echo ""

# Exit with success if most requests succeeded
SUCCESS_RATE=$(echo "scale=2; ($SUCCESSFUL_ORDERS + $SHIPPED_SUCCESS) / $TOTAL_REQUESTS * 100" | bc 2>/dev/null || echo "0")
echo ""
echo "Success Rate: $SUCCESS_RATE%"

if [ $SUCCESSFUL_ORDERS -ge $((NUM_ORDERS / 2)) ]; then
    echo "✓ Load test PASSED (acceptable success rate with chaos enabled)"
    exit 0
else
    echo "✗ Load test FAILED (too many failures)"
    exit 1
fi
