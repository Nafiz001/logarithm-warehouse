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
        pending: 'bg-slate-100 text-slate-800 border-2 border-slate-300',
        confirmed: 'bg-blue-100 text-blue-800 border-2 border-blue-300',
        shipped: 'bg-accent text-black border-2 border-black',
        cancelled: 'bg-red-100 text-red-800 border-2 border-red-300'
    };
    return `<span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${badges[status] || 'bg-slate-100 text-slate-800'}">${status}</span>`;
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
 * Get product image URL based on product name
 */
function getProductImage(productName) {
    const name = productName.toLowerCase();
    
    // Map product names to Unsplash images
    if (name.includes('monitor') || name.includes('display')) {
        return 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&h=300&fit=crop';
    }
    if (name.includes('chair')) {
        return 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400&h=300&fit=crop';
    }
    if (name.includes('console') || name.includes('gaming')) {
        return 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop';
    }
    if (name.includes('headset') || name.includes('headphone')) {
        return 'https://images.unsplash.com/photo-1599669454699-248893623440?w=400&h=300&fit=crop';
    }
    if (name.includes('keyboard')) {
        return 'https://icon2.cleanpng.com/20180520/lwc/kisspng-computer-keyboard-cooler-master-masterkeys-pro-l-m-5b014e75338806.2634158315268122772111.jpg';
    }
    if (name.includes('mouse')) {
        return 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTX4fitkifC9A9gcbsOgbBn_GSySjXcRpF3VQ&s';
    }
    if (name.includes('laptop') || name.includes('notebook')) {
        return 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=300&fit=crop';
    }
    if (name.includes('phone') || name.includes('mobile')) {
        return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop';
    }
    if (name.includes('speaker')) {
        return 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400&h=300&fit=crop';
    }
    if (name.includes('controller') || name.includes('gamepad')) {
        return 'https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=400&h=300&fit=crop';
    }
    // Default product image
    return 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400&h=300&fit=crop';
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
        <div class="group bg-white rounded-3xl p-4 border-2 border-slate-100 hover:border-black transition-all duration-300 hover:shadow-neubrutalism">
            <div class="aspect-[4/3] bg-slate-50 rounded-2xl flex items-center justify-center mb-4 relative overflow-hidden">
                <img src="${getProductImage(product.name)}" alt="${product.name}" 
                    class="w-full h-full object-cover rounded-2xl group-hover:scale-110 transition-transform duration-500"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="material-icons-round text-6xl text-slate-200 hidden items-center justify-center absolute inset-0">inventory_2</span>
                <div class="absolute top-3 right-3 ${product.stock_quantity > 50 ? 'bg-white border border-slate-100' : product.stock_quantity > 10 ? 'bg-accent' : 'bg-red-500 text-white'} px-2 py-1 rounded-lg text-xs font-bold shadow-sm">
                    ${product.stock_quantity > 10 ? product.stock_quantity + ' LEFT' : 'LOW STOCK'}
                </div>
            </div>
            <div class="px-1">
                <h4 class="font-bold text-lg leading-tight mb-1">${product.name}</h4>
                <p class="text-xs text-slate-400 mb-2 line-clamp-1">${product.description || 'No description'}</p>
                <div class="flex justify-between items-center mt-3">
                    <span class="font-mono text-sm text-slate-400">ID: ${product.id.substring(0, 8)}</span>
                    <span class="font-display font-bold text-xl">${formatCurrency(product.price)}</span>
                </div>
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
                <td colspan="6" class="px-6 py-8 text-center text-slate-500">
                    <span class="material-icons-round text-6xl text-slate-200 mb-2 block">inbox</span>
                    <p class="font-medium">No orders found. Create your first order!</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr class="group hover:bg-slate-50 transition-colors fade-in">
            <td class="px-6 py-5 pl-8">
                <div class="font-mono font-bold">#${order.id.substring(0, 7)}</div>
                <div class="text-xs text-slate-400 mt-1">${formatDate(order.created_at)}</div>
            </td>
            <td class="px-6 py-5">
                <div class="font-bold">${order.customer_name}</div>
                <div class="text-xs text-slate-400">${order.customer_email || 'No email'}</div>
            </td>
            <td class="px-6 py-5 font-bold font-display text-lg">${formatCurrency(order.total_amount)}</td>
            <td class="px-6 py-5">
                ${getStatusBadge(order.status)}
            </td>
            <td class="px-6 py-5">
                ${order.inventory_updated 
                    ? '<span class="text-green-600 font-medium"><i class="fas fa-check mr-1"></i>Updated</span>' 
                    : '<span class="text-slate-400"><i class="fas fa-clock mr-1"></i>Pending</span>'}
            </td>
            <td class="px-6 py-5 text-right">
                ${order.status === 'pending' || order.status === 'confirmed' ? `
                    <button onclick="shipOrder('${order.id}')" class="px-4 py-2 bg-black text-white text-sm rounded-xl font-bold hover:bg-accent hover:text-black transition-all">
                        <i class="fas fa-truck mr-1"></i>Ship
                    </button>
                ` : `
                    <span class="text-slate-400 text-sm font-medium"><i class="fas fa-check mr-1"></i>Completed</span>
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
            <div class="bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
                <div class="flex justify-between items-center mb-6">
                    <span class="font-bold flex items-center gap-2">
                        <span class="material-icons-round text-purple-400">schedule</span>
                        Gremlin Latency
                    </span>
                    <span class="text-xs font-mono ${data.gremlin?.enabled ? 'text-accent' : 'text-slate-500'}">${data.gremlin?.enabled ? 'ACTIVE' : 'DISABLED'}</span>
                </div>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Delay Amount</span>
                        <span class="font-mono text-accent">${data.gremlin?.delayMs || 0}ms</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Every Nth Request</span>
                        <span class="font-mono">${data.gremlin?.everyNthRequest || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Next Delay In</span>
                        <span class="font-mono">${data.gremlin?.nextDelayIn || 'N/A'} requests</span>
                    </div>
                </div>
            </div>
            <div class="bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
                <div class="flex justify-between items-center mb-6">
                    <span class="font-bold flex items-center gap-2">
                        <span class="material-icons-round text-red-400">warning</span>
                        Chaos Events
                    </span>
                    <span class="text-xs font-mono ${data.chaos?.enabled ? 'text-accent' : 'text-slate-500'}">${data.chaos?.enabled ? 'ACTIVE' : 'DISABLED'}</span>
                </div>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Crash Probability</span>
                        <span class="font-mono text-red-400">${((data.chaos?.crashProbability || 0) * 100).toFixed(0)}%</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-400">Total Chaos Events</span>
                        <span class="font-mono">${data.chaos?.totalChaosEvents || 0}</span>
                    </div>
                    <div class="mt-4">
                        <div class="flex justify-between text-xs mb-2">
                            <span class="text-slate-500">Resilience Score</span>
                            <span>${100 - ((data.chaos?.crashProbability || 0) * 100)}%</span>
                        </div>
                        <div class="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full bg-accent" style="width: ${100 - ((data.chaos?.crashProbability || 0) * 100)}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load chaos status:', error);
        document.getElementById('chaos-status').innerHTML = `
            <div class="bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm col-span-2 text-center">
                <span class="material-icons-round text-4xl text-slate-500 mb-2">error_outline</span>
                <p class="text-slate-400">Unable to load chaos status</p>
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
        loadChaosStatus(),
        loadTimeoutConfig()
    ]);
    
    // Auto-refresh health status every 30 seconds
    setInterval(loadHealthStatus, 30000);
    
    // Auto-refresh chaos status every 10 seconds
    setInterval(loadChaosStatus, 10000);
    
    console.log('Dashboard initialized!');
}

/**
 * Load current timeout configuration
 */
async function loadTimeoutConfig() {
    try {
        const response = await fetch(`${API_BASE}/orders/config/timeout`);
        if (!response.ok) throw new Error('Failed to load timeout config');
        const data = await response.json();
        updateTimeoutUI(data.currentTimeoutMs);
    } catch (error) {
        console.error('Failed to load timeout config:', error);
        document.getElementById('current-timeout').textContent = 'Error loading';
    }
}

/**
 * Set timeout value
 */
async function setTimeoutValue(timeoutMs) {
    try {
        const response = await fetch(`${API_BASE}/orders/config/timeout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeoutMs })
        });
        
        if (!response.ok) throw new Error('Failed to update timeout');
        const data = await response.json();
        
        updateTimeoutUI(data.currentTimeoutMs);
        showToast(`Timeout updated to ${timeoutMs / 1000}s`, 'success');
    } catch (error) {
        console.error('Failed to update timeout:', error);
        showToast('Failed to update timeout', 'error');
    }
}

/**
 * Update timeout UI
 */
function updateTimeoutUI(timeoutMs) {
    document.getElementById('current-timeout').textContent = `${timeoutMs / 1000}s`;
    
    const btn3s = document.getElementById('btn-3s');
    const btn6s = document.getElementById('btn-6s');
    
    if (timeoutMs === 3000) {
        btn3s.className = 'px-6 py-3 bg-black text-white rounded-xl hover:bg-accent hover:text-black transition-all font-bold border-2 border-black';
        btn6s.className = 'px-6 py-3 bg-slate-100 text-black rounded-xl hover:bg-slate-200 transition-all font-bold border-2 border-transparent';
    } else {
        btn3s.className = 'px-6 py-3 bg-slate-100 text-black rounded-xl hover:bg-slate-200 transition-all font-bold border-2 border-transparent';
        btn6s.className = 'px-6 py-3 bg-black text-white rounded-xl hover:bg-accent hover:text-black transition-all font-bold border-2 border-black';
    }
}

// Start the app
init();
