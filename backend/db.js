const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, process.env.DATABASE_URL || './database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper functions to wrap sqlite3 queries in Promises
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize schema and seed data
async function initDb() {
  // 1. Customers Table
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      phone_hash TEXT PRIMARY KEY,
      phone_enc TEXT NOT NULL,
      name_enc TEXT NOT NULL,
      credit_balance REAL DEFAULT 0.0
    )
  `);

  // 2. Products Table
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock_qty INTEGER NOT NULL
    )
  `);

  // 3. Transactions Table
  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      tx_id TEXT PRIMARY KEY,
      phone_hash TEXT,
      total REAL NOT NULL,
      credits_used REAL NOT NULL,
      credits_earned REAL NOT NULL,
      items_enc TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (phone_hash) REFERENCES customers(phone_hash)
    )
  `);

  // Seed sample products if empty
  const count = await get('SELECT COUNT(*) as count FROM products');
  if (count.count === 0) {
    console.log('Seeding initial products into database...');
    const sampleProducts = [
      { product_id: '1001', name: 'Whole Milk 1L', price: 2.99, stock_qty: 100 },
      { product_id: '1002', name: 'Organic White Bread', price: 3.49, stock_qty: 75 },
      { product_id: '1003', name: 'Fresh Red Apples (1kg)', price: 4.99, stock_qty: 50 },
      { product_id: '1004', name: 'Chocolate Chip Cookies 300g', price: 3.99, stock_qty: 40 },
      { product_id: '1005', name: 'Orange Juice 2L', price: 5.49, stock_qty: 30 },
      { product_id: '1006', name: 'Greek Yogurt 500g', price: 4.29, stock_qty: 60 },
      { product_id: '1007', name: 'Premium Espresso Beans 1kg', price: 18.99, stock_qty: 25 },
      { product_id: '1008', name: 'Extra Virgin Olive Oil 500ml', price: 9.99, stock_qty: 20 },
      { product_id: '1009', name: 'Organic Eggs 12-pack', price: 4.59, stock_qty: 80 },
      { product_id: '1010', name: 'Paper Towels 2-pack', price: 2.49, stock_qty: 120 }
    ];

    for (const prod of sampleProducts) {
      await run(
        'INSERT INTO products (product_id, name, price, stock_qty) VALUES (?, ?, ?, ?)',
        [prod.product_id, prod.name, prod.price, prod.stock_qty]
      );
    }
    console.log('Products seeding complete.');
  }
}

// Run schema initialization
initDb()
  .then(() => console.log('Database schemas initialized successfully.'))
  .catch((err) => console.error('Database schema initialization failed:', err));

module.exports = {
  db,
  run,
  get,
  all
};
