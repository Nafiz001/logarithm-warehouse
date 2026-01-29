/**
 * Chaos Lab - Stress Testing Dashboard
 * Triggers Grafana red alerts by simulating high latency scenarios
 */

const API_BASE = window.location.origin;

// Statistics
let stats = {
    created: 0,
    shipped: 0,
    failed: 0
};

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
    
    const icons = {
        success: 'fa-check-circle text-green-500',
        error: 'fa-exclamation-circle text-red-500',
        warning: 'fa-exclamation-triangle text-yellow-500',
        info: 'fa-info-circle text-blue-500'
    };
    toastIcon.className = `fas ${icons[type] || icons.info}`;
    
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

/**
 * Add log entry
 */
function addLog(message, type = 'info') {
    const log = document.getElementById('activity-log');
    const timestamp = new Date().toLocaleTimeString();
    
    const colors = {
        info: 'text-slate-400',
        success: 'text-green-400',
        error: 'text-red-400',
        warning: 'text-yellow-400',
        delay: 'text-purple-400'
    };
    
    const icons = {
        info: '○',
        success: '✓',
        error: '✗',
        warning: '⚠',
        delay: '◐'
    };
    
    // Clear placeholder if first log
    if (log.querySelector('.text-center')) {
        log.innerHTML = '';
    }
    
    const entry = document.createElement('div');
    entry.className = `log-entry py-1 border-b border-white/5 ${colors[type]}`;
    entry.innerHTML = `<span class="text-slate-600">[${timestamp}]</span> ${icons[type]} ${message}`;
    
    log.insertBefore(entry, log.firstChild);
    
    // Keep only last 100 entries
    while (log.children.length > 100) {
        log.removeChild(log.lastChild);
    }
}

/**
 * Clear log
 */
function clearLog() {
    document.getElementById('activity-log').innerHTML = `
        <div class="text-slate-500 text-center py-8">
            Activity log cleared...
        </div>
    `;
}

/**
 * Update stats display
 */
function updateStats() {
    document.getElementById('stat-created').textContent = stats.created;
    document.getElementById('stat-shipped').textContent = stats.shipped;
    document.getElementById('stat-failed').textContent = stats.failed;
}

/**
 * Reset stats
 */
function resetStats() {
    stats = { created: 0, shipped: 0, failed: 0 };
    updateStats();
}

/**
 * Update alert status panel
 */
function updateAlertStatus(isRed) {
    const panel = document.getElementById('alert-status');
    const indicator = document.getElementById('alert-indicator');
    const title = document.getElementById('alert-title');
    const subtitle = document.getElementById('alert-subtitle');
    
    if (isRed) {
        panel.className = 'bg-danger/20 border-2 border-danger rounded-3xl p-8 transition-all duration-500';
        indicator.className = 'w-16 h-16 bg-danger rounded-full flex items-center justify-center pulse-red';
        indicator.innerHTML = '<span class="material-icons-round text-3xl text-white">error</span>';
        title.textContent = 'HIGH LATENCY DETECTED';
        title.className = 'text-2xl font-display font-bold text-danger';
        subtitle.textContent = 'Average response time exceeds 1 second - Grafana should show RED';
    } else {
        panel.className = 'bg-success/20 border-2 border-success rounded-3xl p-8 transition-all duration-500';
        indicator.className = 'w-16 h-16 bg-success rounded-full flex items-center justify-center pulse-green';
        indicator.innerHTML = '<span class="material-icons-round text-3xl text-white">check_circle</span>';
        title.textContent = 'System Normal';
        title.className = 'text-2xl font-display font-bold';
        subtitle.textContent = 'Average response time is below 1 second';
    }
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
        document.getElementById('current-timeout').textContent = 'Error';
    }
}

/**
 * Set timeout value
 */
async function setTimeoutValue(timeoutMs) {
    try {
        addLog(`Setting timeout to ${timeoutMs / 1000}s...`, 'info');
        
        const response = await fetch(`${API_BASE}/orders/config/timeout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeoutMs })
        });
        
        if (!response.ok) throw new Error('Failed to update timeout');
        const data = await response.json();
        
        updateTimeoutUI(data.currentTimeoutMs);
        addLog(`Timeout set to ${timeoutMs / 1000}s`, 'success');
        showToast(`Timeout updated to ${timeoutMs / 1000}s`, 'success');
    } catch (error) {
        console.error('Failed to update timeout:', error);
        addLog(`Failed to set timeout: ${error.message}`, 'error');
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
        btn3s.className = 'px-6 py-4 bg-accent text-black rounded-xl font-bold border-2 border-accent text-center shadow-neubrutalism-sm';
        btn6s.className = 'px-6 py-4 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all font-bold border-2 border-transparent text-center';
    } else {
        btn3s.className = 'px-6 py-4 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all font-bold border-2 border-transparent text-center';
        btn6s.className = 'px-6 py-4 bg-accent text-black rounded-xl font-bold border-2 border-accent text-center shadow-neubrutalism-sm';
    }
}

/**
 * Load products
 */
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE}/inventory/products`);
        if (!response.ok) throw new Error('Failed to load products');
        const data = await response.json();
        productsCache = data.products || [];
        addLog(`Loaded ${productsCache.length} products`, 'info');
    } catch (error) {
        console.error('Failed to load products:', error);
        addLog('Failed to load products', 'error');
    }
}

/**
 * Load chaos status
 */
async function loadChaosStatus() {
    try {
        const response = await fetch(`${API_BASE}/inventory/status`);
        if (!response.ok) throw new Error('Failed to load chaos status');
        const data = await response.json();
        
        document.getElementById('gremlin-status').textContent = data.gremlin?.enabled ? 'ACTIVE' : 'DISABLED';
        document.getElementById('gremlin-status').className = data.gremlin?.enabled ? 'text-success font-mono' : 'text-slate-500 font-mono';
        
        document.getElementById('chaos-status-indicator').textContent = data.chaos?.enabled ? 'ACTIVE' : 'DISABLED';
        document.getElementById('chaos-status-indicator').className = data.chaos?.enabled ? 'text-success font-mono' : 'text-slate-500 font-mono';
    } catch (error) {
        console.error('Failed to load chaos status:', error);
    }
}

/**
 * Create a single order
 */
async function createOrder(customerName, product, quantity) {
    const response = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            customerName,
            customerEmail: `${customerName.toLowerCase().replace(' ', '.')}@test.com`,
            items: [{
                productId: product.id,
                productName: product.name,
                quantity,
                unitPrice: product.price
            }]
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create order');
    }
    
    return await response.json();
}

/**
 * Ship an order
 */
async function shipOrder(orderId) {
    const startTime = Date.now();
    
    const response = await fetch(`${API_BASE}/orders/${orderId}/ship`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to ship order');
    }
    
    return { response: await response.json(), duration };
}

/**
 * Trigger red alert - Create and ship 10 orders
 */
async function triggerRedAlert() {
    const btn = document.getElementById('btn-trigger');
    const btnText = document.getElementById('trigger-btn-text');
    
    if (productsCache.length === 0) {
        showToast('No products available', 'error');
        return;
    }
    
    // Disable button
    btn.disabled = true;
    btnText.innerHTML = '<div class="loader mr-2"></div> Running...';
    
    // Reset stats
    resetStats();
    
    // First, ensure timeout is set to 6s
    addLog('Step 1: Setting timeout to 6s to capture gremlin delays...', 'info');
    await setTimeoutValue(6000);
    await new Promise(r => setTimeout(r, 500));
    
    addLog('Step 2: Creating and shipping 10 orders...', 'info');
    addLog('─'.repeat(50), 'info');
    
    const customerNames = [
        'Alice Johnson', 'Bob Smith', 'Carol White', 'David Brown', 'Eve Davis',
        'Frank Miller', 'Grace Wilson', 'Henry Moore', 'Ivy Taylor', 'Jack Anderson'
    ];
    
    let delayedCount = 0;
    
    for (let i = 0; i < 10; i++) {
        const customer = customerNames[i];
        const product = productsCache[i % productsCache.length];
        const orderNum = i + 1;
        
        try {
            // Create order
            addLog(`[${orderNum}/10] Creating order for ${customer}...`, 'info');
            const createResult = await createOrder(customer, product, 1);
            stats.created++;
            updateStats();
            addLog(`[${orderNum}/10] Order created: ${createResult.order.id.substring(0, 8)}...`, 'success');
            
            // Ship order
            addLog(`[${orderNum}/10] Shipping order...`, 'info');
            const shipResult = await shipOrder(createResult.order.id);
            stats.shipped++;
            updateStats();
            
            // Check if this was a delayed request (gremlin hit)
            if (shipResult.duration > 4000) {
                delayedCount++;
                addLog(`[${orderNum}/10] GREMLIN HIT! Shipped in ${shipResult.duration}ms`, 'delay');
            } else {
                addLog(`[${orderNum}/10] Shipped in ${shipResult.duration}ms`, 'success');
            }
            
        } catch (error) {
            stats.failed++;
            updateStats();
            addLog(`[${orderNum}/10] FAILED: ${error.message}`, 'error');
        }
        
        // Small delay between orders
        await new Promise(r => setTimeout(r, 100));
    }
    
    addLog('─'.repeat(50), 'info');
    addLog(`Completed: ${stats.shipped} shipped, ${stats.failed} failed, ${delayedCount} gremlin hits`, 'info');
    
    // Check if we triggered red alert
    if (delayedCount >= 2) {
        updateAlertStatus(true);
        addLog('🔴 RED ALERT should be visible in Grafana!', 'warning');
        showToast('Red alert triggered! Check Grafana dashboard.', 'warning');
    } else {
        addLog('Not enough gremlin hits to trigger red alert. Try again.', 'warning');
    }
    
    // Re-enable button
    btn.disabled = false;
    btnText.textContent = 'Create & Ship 10 Orders';
}

/**
 * Initialize
 */
async function init() {
    addLog('Chaos Lab initializing...', 'info');
    
    await Promise.all([
        loadTimeoutConfig(),
        loadProducts(),
        loadChaosStatus()
    ]);
    
    addLog('Chaos Lab ready!', 'success');
    
    // Auto-refresh chaos status
    setInterval(loadChaosStatus, 10000);
}

// Start
init();
