const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create inventory_transactions table for audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id UUID PRIMARY KEY,
        product_id UUID REFERENCES products(id),
        order_id UUID,
        idempotency_key VARCHAR(255) UNIQUE,
        quantity_change INTEGER NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
      CREATE INDEX IF NOT EXISTS idx_transactions_order ON inventory_transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON inventory_transactions(idempotency_key);
    `);

    // Seed sample products if not exist
    const existingProducts = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(existingProducts.rows[0].count) === 0) {
      await seedSampleProducts(client);
    }

    console.log('Inventory database tables initialized');
  } finally {
    client.release();
  }
}

async function seedSampleProducts(client) {
  const products = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Gaming Console X', price: 499.99, stock: 100 },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Wireless Controller', price: 59.99, stock: 250 },
    { id: '33333333-3333-3333-3333-333333333333', name: 'VR Headset Pro', price: 399.99, stock: 50 },
    { id: '44444444-4444-4444-4444-444444444444', name: '4K Gaming Monitor', price: 699.99, stock: 75 },
    { id: '55555555-5555-5555-5555-555555555555', name: 'Gaming Keyboard RGB', price: 149.99, stock: 200 },
    { id: '66666666-6666-6666-6666-666666666666', name: 'Gaming Mouse Elite', price: 89.99, stock: 300 },
    { id: '77777777-7777-7777-7777-777777777777', name: 'Headset 7.1 Surround', price: 129.99, stock: 150 },
    { id: '88888888-8888-8888-8888-888888888888', name: 'Gaming Chair Pro', price: 299.99, stock: 40 }
  ];

  for (const product of products) {
    await client.query(
      `INSERT INTO products (id, name, price, stock_quantity, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [product.id, product.name, product.price, product.stock, `High quality ${product.name}`]
    );
  }

  console.log('Sample products seeded');
}

async function checkDatabaseHealth() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT 1 as health');
    
    // Verify tables exist
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('products', 'inventory_transactions')
    `);

    // Get product count
    const productCount = await client.query('SELECT COUNT(*) FROM products');
    
    return {
      connected: true,
      tablesExist: tablesResult.rows.length === 2,
      tables: tablesResult.rows.map(r => r.table_name),
      productCount: parseInt(productCount.rows[0].count)
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initializeDatabase,
  checkDatabaseHealth
};
