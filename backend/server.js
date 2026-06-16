const express = require('express');
const cors = require('cors');
const { hashPhone, encrypt, decrypt } = require('./crypto');
const { run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Log incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 1. Customer Check-In / Search
app.get('/api/customers/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const phoneHash = hashPhone(phone);
    const customer = await get('SELECT * FROM customers WHERE phone_hash = ?', [phoneHash]);
    
    if (customer) {
      // Decrypt personal details for the UI
      const name = decrypt(customer.name_enc);
      const decPhone = decrypt(customer.phone_enc);
      
      return res.json({
        found: true,
        phone: decPhone,
        name,
        credit_balance: customer.credit_balance
      });
    } else {
      return res.json({ found: false });
    }
  } catch (error) {
    console.error('Error fetching customer:', error);
    return res.status(500).json({ error: 'Database error occurred during customer lookup' });
  }
});

// 1.5. List All Customers (Decrypted for admin view)
app.get('/api/customers', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM customers ORDER BY credit_balance DESC');
    const decryptedCustomers = rows.map(row => ({
      phone: decrypt(row.phone_enc),
      name: decrypt(row.name_enc),
      credit_balance: row.credit_balance
    }));
    return res.json(decryptedCustomers);
  } catch (error) {
    console.error('Error listing customers:', error);
    return res.status(500).json({ error: 'Database error listing customers' });
  }
});

// 2. Customer Registration
app.post('/api/customers', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone || !name) {
    return res.status(400).json({ error: 'Phone number and Name are required' });
  }
  
  try {
    const phoneHash = hashPhone(phone);
    const existing = await get('SELECT 1 FROM customers WHERE phone_hash = ?', [phoneHash]);
    
    if (existing) {
      return res.status(400).json({ error: 'Customer with this phone number already exists' });
    }
    
    const phoneEnc = encrypt(phone);
    const nameEnc = encrypt(name.trim());
    
    await run(
      'INSERT INTO customers (phone_hash, phone_enc, name_enc, credit_balance) VALUES (?, ?, ?, 0.0)',
      [phoneHash, phoneEnc, nameEnc]
    );
    
    return res.status(201).json({
      success: true,
      customer: {
        phone,
        name: name.trim(),
        credit_balance: 0.0
      }
    });
  } catch (error) {
    console.error('Error registering customer:', error);
    return res.status(500).json({ error: 'Database error occurred during customer registration' });
  }
});

// 3. Product Lookup by ID
app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = await get('SELECT * FROM products WHERE product_id = ?', [id]);
    if (product) {
      return res.json({ found: true, product });
    } else {
      return res.json({ found: false });
    }
  } catch (error) {
    console.error('Error fetching product:', error);
    return res.status(500).json({ error: 'Database error during product lookup' });
  }
});

// 4. List All Products (useful for visual auto-complete or catalog reference)
app.get('/api/products', async (req, res) => {
  try {
    const products = await all('SELECT * FROM products ORDER BY name ASC');
    return res.json(products);
  } catch (error) {
    console.error('Error listing products:', error);
    return res.status(500).json({ error: 'Database error listing products' });
  }
});

// 3. Add New Product
app.post('/api/products', async (req, res) => {
  const { product_id, name, price, stock_qty } = req.body;
  if (!product_id || !name || price == null || stock_qty == null) {
    return res.status(400).json({ error: 'product_id, name, price, and stock_qty are required' });
  }
  if (isNaN(parseFloat(price)) || isNaN(parseInt(stock_qty))) {
    return res.status(400).json({ error: 'price must be a number and stock_qty must be an integer' });
  }
  try {
    await run(
      'INSERT INTO products (product_id, name, price, stock_qty) VALUES (?, ?, ?, ?)',
      [product_id, name.trim(), parseFloat(price), parseInt(stock_qty)]
    );
    const newProduct = await get('SELECT * FROM products WHERE product_id = ?', [product_id]);
    return res.status(201).json({ success: true, product: newProduct });
  } catch (error) {
    console.error('Error adding product:', error);
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Product ID already exists' });
    }
    return res.status(500).json({ error: 'Database error adding product' });
  }
});
// 5. Checkout Transaction and Credit Engine
app.post('/api/transactions', async (req, res) => {
  const { phone, items, creditsUsed } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Transaction cart items are required' });
  }
  
  try {
    // Start transactional checks
    // Calculate subtotal from items in cart, and fetch product details from DB to prevent client-side price tampering
    let calculatedSubtotal = 0.0;
    const verifiedItems = [];
    
    for (const item of items) {
      const dbProduct = await get('SELECT * FROM products WHERE product_id = ?', [item.product_id]);
      if (!dbProduct) {
        return res.status(400).json({ error: `Product ID ${item.product_id} not found` });
      }
      if (dbProduct.stock_qty < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for product: ${dbProduct.name}. Requested: ${item.quantity}, Available: ${dbProduct.stock_qty}` 
        });
      }
      
      const itemPrice = dbProduct.price;
      calculatedSubtotal += itemPrice * item.quantity;
      verifiedItems.push({
        product_id: item.product_id,
        name: dbProduct.name,
        price: itemPrice,
        quantity: item.quantity
      });
    }
    
    let dbCustomer = null;
    let finalCreditsUsed = 0.0;
    let creditsEarned = 0.0;
    let phoneHash = null;
    
    // 8% tax calculation
    const taxRate = 0.08;
    const calculatedTax = parseFloat((calculatedSubtotal * taxRate).toFixed(2));
    const billTotal = parseFloat((calculatedSubtotal + calculatedTax).toFixed(2));
    
    if (phone) {
      phoneHash = hashPhone(phone);
      dbCustomer = await get('SELECT * FROM customers WHERE phone_hash = ?', [phoneHash]);
      if (!dbCustomer) {
        return res.status(400).json({ error: 'Customer phone number not found in system' });
      }
      
      // If customer is checked-in, handle credit calculation
      const currentCredits = dbCustomer.credit_balance;
      
      if (creditsUsed > 0) {
        // Enforce that we don't redeem more credits than available, and not more than the total bill (subtotal + tax)
        finalCreditsUsed = Math.min(currentCredits, creditsUsed, billTotal);
        // Round to 2 decimal places to avoid floating point issues
        finalCreditsUsed = parseFloat(finalCreditsUsed.toFixed(2));
      }
      
      // Credit Earning Rule: 5% of amount paid via cash/card (pre-tax portion)
      // Credits Earned = (Subtotal - Credits Redeemed) * 0.05
      // If credits redeemed exceed subtotal, they earn 0 credits
      const taxablePortionPaid = Math.max(0, calculatedSubtotal - finalCreditsUsed);
      creditsEarned = parseFloat((taxablePortionPaid * 0.05).toFixed(2));
    }
    
    // Generate transaction ID
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const txId = `TX-${dateStr}-${randSuffix}`;
    
    // DB TRANSACTION (SQLite is single-threaded, but we chain sequential promises to ensure integrity)
    // Decrement inventory stock
    for (const item of verifiedItems) {
      await run(
        'UPDATE products SET stock_qty = stock_qty - ? WHERE product_id = ?',
        [item.quantity, item.product_id]
      );
    }
    
    // Update Customer wallet balance if registered
    let newCreditBalance = 0.0;
    if (dbCustomer) {
      newCreditBalance = parseFloat((dbCustomer.credit_balance - finalCreditsUsed + creditsEarned).toFixed(2));
      await run(
        'UPDATE customers SET credit_balance = ? WHERE phone_hash = ?',
        [newCreditBalance, phoneHash]
      );
    }
    
    // Encrypt cart details to protect customer's purchase history privacy
    const itemsEncrypted = encrypt(JSON.stringify(verifiedItems));
    
    // Record Transaction
    await run(
      `INSERT INTO transactions (tx_id, phone_hash, total, credits_used, credits_earned, items_enc, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        phoneHash,
        billTotal, // Store gross total (subtotal + tax)
        finalCreditsUsed,
        creditsEarned,
        itemsEncrypted,
        new Date().toISOString()
      ]
    );
    
    return res.status(200).json({
      success: true,
      tx_id: txId,
      subtotal: calculatedSubtotal,
      tax: calculatedTax,
      total: billTotal,
      credits_used: finalCreditsUsed,
      credits_earned: creditsEarned,
      cash_paid: parseFloat((billTotal - finalCreditsUsed).toFixed(2)),
      new_credit_balance: newCreditBalance,
      timestamp: new Date().toISOString(),
      items: verifiedItems
    });
    
  } catch (error) {
    console.error('Transaction processing failed:', error);
    return res.status(500).json({ error: 'Server error processing transaction: ' + error.message });
  }
});

// Run server
app.listen(PORT, () => {
  console.log(`Credit-POS Backend Server running on http://localhost:${PORT}`);
});
