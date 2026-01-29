/**
 * Logarithm Warehouse Dashboard
 * API Client and UI Logic
 */

// API Base URL - Uses nginx through the same origin when served via Docker
// The frontend is served by nginx on port 80, same as API
const API_BASE = window.location.origin;

// Products cache
let productsCache = [];

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    toastMessage.textContent = message;
    
    // Set icon based on type
    const icons = {
        success: 'fa-check-circle text-green-400',
        error: 'fa-exclamation-circle text-red-400',
        warning: 'fa-exclamation-triangle text-yellow-400',
        info: 'fa-info-circle text-blue-400'
    };
    toastIcon.className = `fas ${icons[type] || icons.info}`;
    
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Format date
 */
function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const badges = {
        pending: 'bg-yellow-100 text-yellow-800',
        confirmed: 'bg-blue-100 text-blue-800',
        shipped: 'bg-green-100 text-green-800',
        cancelled: 'bg-red-100 text-red-800'
    };
    return `<span class="px-2 py-1 rounded-full text-xs font-medium ${badges[status] || 'bg-gray-100 text-gray-800'}">${status}</span>`;
}

/**
 * API: Fetch service health
 */
async function fetchHealth(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Health check failed for ${endpoint}:`, error);
        return null;
    }
}

/**
 * Update health status UI
 */
function updateHealthUI(elementId, detailsId, healthData) {
    const statusEl = document.getElementById(elementId);
    const detailsEl = document.getElementById(detailsId);
    
    if (!healthData) {
        statusEl.innerHTML = '<i class="fas fa-times-circle text-red-500"></i>';
        detailsEl.innerHTML = '<p class="text-red-500">Service unreachable</p>';
        return;
    }
    
    const isHealthy = healthData.status === 'healthy';
    const isDegraded = healthData.status === 'degraded';
    
    if (isHealthy) {
        statusEl.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>';
    } else if (isDegraded) {
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle text-yellow-500"></i>';
    } else {
        statusEl.innerHTML = '<i class="fas fa-times-circle text-red-500"></i>';
    }
    
    let details = `<p><strong>Status:</strong> <span class="status-${healthData.status}">${healthData.status}</span></p>`;
    
    if (healthData.uptime) {
        const uptimeMinutes = Math.floor(healthData.uptime / 60);
        details += `<p><strong>Uptime:</strong> ${uptimeMinutes} minutes</p>`;
    }
    
    if (healthData.checks?.database) {
        const dbStatus = healthData.checks.database.status;
        details += `<p><strong>Database:</strong> <span class="status-${dbStatus}">${dbStatus}</span></p>`;
    }
    
    if (healthData.responseTimeMs) {
        details += `<p><strong>Response:</strong> ${healthData.responseTimeMs}ms</p>`;
    }
    
    detailsEl.innerHTML = details;
}

/**
 * Load all health statuses
 */
async function loadHealthStatus() {
    // Fetch all health endpoints in parallel
    const [orderHealth, inventoryHealth, nginxHealth] = await Promise.all([
        fetchHealth('/order-health'),
        fetchHealth('/inventory-health'),
        fetchHealth('/health')
    ]);
    
    updateHealthUI('order-health-status', 'order-health-details', orderHealth);
    updateHealthUI('inventory-health-status', 'inventory-health-details', inventoryHealth);
    updateHealthUI('nginx-health-status', 'nginx-health-details', nginxHealth);
}

/**
 * API: Get all products
 */
async function fetchProducts() {
    try {
        const response = await fetch(`${API_BASE}/inventory/products`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.products || [];
    } catch (error) {
        console.error('Failed to fetch products:', error);
        showToast('Failed to load products', 'error');
        return [];
    }
}

/**
 * Load and display products
 */
async function loadProducts() {
    const products = await fetchProducts();
    productsCache = products;
    
    const grid = document.getElementById('products-grid');
    const select = document.getElementById('product-select');
    
    if (products.length === 0) {
        grid.innerHTML = '<div class="col-span-4 text-center text-gray-500 py-8">No products found</div>';
        select.innerHTML = '<option value="">No products available</option>';
        return;
    }
    
    // Update products grid
    grid.innerHTML = products.map(product => `
        <div class="bg-white rounded-lg shadow-md p-4 card-hover transition-all duration-200">
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-semibold text-gray-800 text-sm">${product.name}</h4>
                <span class="text-lg font-bold text-blue-600">${formatCurrency(product.price)}</span>
            </div>
            <p class="text-xs text-gray-500 mb-3">${product.description || 'No description'}</p>
            <div class="flex items-center justify-between">
                <span class="text-xs text-gray-400">ID: ${product.id.substring(0, 8)}...</span>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${product.stock_quantity > 50 ? 'bg-green-100 text-green-800' : product.stock_quantity > 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                    Stock: ${product.stock_quantity}
                </span>
            </div>
        </div>
    `).join('');
    
    // Update product select dropdown
    select.innerHTML = '<option value="">Select a product...</option>' + 
        products.map(p => `<option value="${p.id}" data-name="${p.name}" data-price="${p.price}">${p.name} - ${formatCurrency(p.price)} (${p.stock_quantity} in stock)</option>`).join('');
}

/**
 * API: Get all orders
 */
async function fetchOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.orders || [];
    } catch (error) {
        console.error('Failed to fetch orders:', error);
        showToast('Failed to load orders', 'error');
        return [];
    }
}

/**
 * Load and display orders
 */
async function loadOrders() {
    const orders = await fetchOrders();
    const tbody = document.getElementById('orders-table-body');
    
    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-2"></i>
                    <p>No orders found. Create your first order above!</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr class="hover:bg-gray-50 fade-in">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${order.id.substring(0, 8)}...</div>
                <div class="text-xs text-gray-500">${formatDate(order.created_at)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${order.customer_name}</div>
                <div class="text-xs text-gray-500">${order.customer_email || 'No email'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${formatCurrency(order.total_amount)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${getStatusBadge(order.status)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${order.inventory_updated 
                    ? '<span class="text-green-600"><i class="fas fa-check mr-1"></i>Updated</span>' 
                    : '<span class="text-gray-400"><i class="fas fa-clock mr-1"></i>Pending</span>'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${order.status === 'pending' || order.status === 'confirmed' ? `
                    <button onclick="shipOrder('${order.id}')" class="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors">
                        <i class="fas fa-truck mr-1"></i>Ship
                    </button>
                ` : `
                    <span class="text-gray-400 text-sm"><i class="fas fa-check mr-1"></i>Completed</span>
                `}
            </td>
        </tr>
    `).join('');
}

/**
 * API: Create order
 */
async function createOrder(orderData) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (orderData.idempotencyKey) {
            headers['X-Idempotency-Key'] = orderData.idempotencyKey;
        }
        
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                customerName: orderData.customerName,
                customerEmail: orderData.customerEmail || null,
                items: orderData.items
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('Failed to create order:', error);
        throw error;
    }
}

/**
 * API: Ship order
 */
async function shipOrder(orderId) {
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/ship`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.retryable) {
                showToast(`Shipping delayed: ${data.message}. Please retry.`, 'warning');
            } else {
                showToast(`Failed to ship: ${data.error}`, 'error');
            }
            return;
        }
        
        showToast('Order shipped successfully!', 'success');
        loadOrders();
        loadProducts(); // Refresh inventory
    } catch (error) {
        console.error('Failed to ship order:', error);
        showToast('Failed to ship order. Please try again.', 'error');
    }
}

/**
 * Load chaos/gremlin status
 */
async function loadChaosStatus() {
    try {
        const response = await fetch(`${API_BASE}/inventory/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const container = document.getElementById('chaos-status');
        
        container.innerHTML = `
            <div class="space-y-3">
                <h4 class="font-semibold text-gray-700">
                    <i class="fas fa-clock mr-2 text-purple-500"></i>Gremlin Latency
                </h4>
                <div class="pl-6 space-y-2 text-sm">
                    <p><strong>Enabled:</strong> ${data.gremlin?.enabled ? '<span class="text-green-600">Yes</span>' : '<span class="text-gray-400">No</span>'}</p>
                    <p><strong>Delay:</strong> ${data.gremlin?.delayMs || 0}ms every ${data.gremlin?.everyNthRequest || 'N/A'} requests</p>
                    <p><strong>Next Delay In:</strong> ${data.gremlin?.nextDelayIn || 'N/A'} requests</p>
                </div>
            </div>
            <div class="space-y-3">
                <h4 class="font-semibold text-gray-700">
                    <i class="fas fa-bomb mr-2 text-red-500"></i>Chaos Events
                </h4>
                <div class="pl-6 space-y-2 text-sm">
                    <p><strong>Enabled:</strong> ${data.chaos?.enabled ? '<span class="text-green-600">Yes</span>' : '<span class="text-gray-400">No</span>'}</p>
                    <p><strong>Crash Probability:</strong> ${((data.chaos?.crashProbability || 0) * 100).toFixed(0)}%</p>
                    <p><strong>Total Chaos Events:</strong> ${data.chaos?.totalChaosEvents || 0}</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load chaos status:', error);
        document.getElementById('chaos-status').innerHTML = `
            <div class="text-center text-gray-500">
                <p>Unable to load chaos status</p>
            </div>
        `;
    }
}

/**
 * Handle order form submission
 */
document.getElementById('create-order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('create-order-btn');
    const result = document.getElementById('order-result');
    
    const customerName = document.getElementById('customer-name').value.trim();
    const customerEmail = document.getElementById('customer-email').value.trim();
    const productSelect = document.getElementById('product-select');
    const quantity = parseInt(document.getElementById('quantity').value);
    const idempotencyKey = document.getElementById('idempotency-key').value.trim();
    
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const productId = productSelect.value;
    const productName = selectedOption.dataset.name;
    const unitPrice = parseFloat(selectedOption.dataset.price);
    
    if (!customerName || !productId || !quantity) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<div class="loader inline-block mr-2"></div> Creating...';
    result.innerHTML = '';
    
    try {
        const orderData = {
            customerName,
            customerEmail: customerEmail || null,
            items: [{
                productId,
                productName,
                quantity,
                unitPrice
            }],
            idempotencyKey: idempotencyKey || `order-${Date.now()}`
        };
        
        const response = await createOrder(orderData);
        
        showToast(response.message || 'Order created successfully!', 'success');
        result.innerHTML = `<span class="text-green-600"><i class="fas fa-check mr-1"></i>Order ${response.order.id.substring(0, 8)}... created!</span>`;
        
        // Reset form
        document.getElementById('customer-name').value = '';
        document.getElementById('customer-email').value = '';
        document.getElementById('product-select').selectedIndex = 0;
        document.getElementById('quantity').value = '1';
        document.getElementById('idempotency-key').value = '';
        
        // Reload orders and products
        loadOrders();
        loadProducts();
    } catch (error) {
        result.innerHTML = `<span class="text-red-600"><i class="fas fa-times mr-1"></i>${error.message}</span>`;
        showToast(`Failed to create order: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i><span>Create Order</span>';
    }
});

/**
 * Initialize dashboard
 */
async function init() {
    console.log('Initializing Logarithm Warehouse Dashboard...');
    
    // Load all data in parallel
    await Promise.all([
        loadHealthStatus(),
        loadProducts(),
        loadOrders(),
        loadChaosStatus()
    ]);
    
    // Auto-refresh health status every 30 seconds
    setInterval(loadHealthStatus, 30000);
    
    // Auto-refresh chaos status every 10 seconds
    setInterval(loadChaosStatus, 10000);
    
    console.log('Dashboard initialized!');
}

// Start the app
init();
