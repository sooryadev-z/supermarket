import React, { useState, useEffect, useRef } from 'react';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const API_BASE = 'http://localhost:5000/api';

export default function App() {
  // POS States
  const [phoneInput, setPhoneInput] = useState('');
  const [customer, setCustomer] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [scanInput, setScanInput] = useState('');
  const [cart, setCart] = useState([]);
  const [applyCredits, setApplyCredits] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  
  // Tab states
  const [activeTab, setActiveTab] = useState('checkout');
  const [customersList, setCustomersList] = useState([]);
  const [customersSearch, setCustomersSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(false);
  const [productsSearch, setProductsSearch] = useState('');
  
  // Registration Modal State
  const [showRegModal, setShowRegModal] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhonePrefill, setRegPhonePrefill] = useState('');
  
  // Add Product Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProdId, setNewProdId] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('');

  // Receipt Modal State
  const [activeTx, setActiveTx] = useState(null);

  // Toast Notification State
  const [notification, setNotification] = useState(null);

  // Input Refs for Keyboard Shortcuts Focus
  const phoneInputRef = useRef(null);
  const scanInputRef = useRef(null);

  // Fetch all products for visual catalog list
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/products`);
      if (res.ok) {
        const data = await res.json();
        setAllProducts(data);
      }
    } catch (err) {
      showToast('Error loading product catalog', 'error');
    }
  };

  const fetchCustomersList = async () => {
    setCustomersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/customers`);
      if (res.ok) {
        const data = await res.json();
        setCustomersList(data);
      }
    } catch (err) {
      showToast('Error loading customer directory', 'error');
    } finally {
      setCustomersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'customers') {
      fetchCustomersList();
    }
  }, [activeTab]);

  const checkInCustomerFromList = (cust) => {
    setCustomer(cust);
    setPhoneInput(cust.phone);
    setApplyCredits(false);
    setActiveTab('checkout');
    showToast(`Checked-in: ${cust.name}`, 'success');
    setTimeout(() => scanInputRef.current?.focus(), 150);
  };

  const filteredCustomers = customersList.filter((c) => {
    const search = customersSearch.toLowerCase();
    return c.name.toLowerCase().includes(search) || c.phone.includes(search);
  });

  const filteredProducts = allProducts.filter((p) => {
    const search = productsSearch.toLowerCase();
    return p.name.toLowerCase().includes(search) || p.product_id.includes(search);
  });

  // Toast Helper
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev && prev.message === message ? null : prev));
    }, 3000);
  };

  // Customer Check-In Lookup
  const handleCustomerLookup = async (phoneToSearch = phoneInput) => {
    if (!phoneToSearch || phoneToSearch.trim() === '') {
      showToast('Please enter a phone number', 'error');
      return;
    }
    
    setSearchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/customers/${encodeURIComponent(phoneToSearch)}`);
      const data = await res.json();
      
      if (data.found) {
        setCustomer(data);
        setPhoneInput(data.phone); // Display formatted phone
        showToast(`Welcome back, ${data.name}!`, 'success');
        setApplyCredits(false); // Reset credits applied toggle
        // Auto focus cart input next
        setTimeout(() => scanInputRef.current?.focus(), 100);
      } else {
        // Automatically open registration modal (FR-1.2)
        setRegPhonePrefill(phoneToSearch);
        setRegName('');
        setShowRegModal(true);
        showToast('Customer not found. Opening registration...', 'info');
      }
    } catch (err) {
      showToast('Error searching customer database', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  // Quick Register Customer
  const handleRegisterCustomer = async (e) => {
    if (e) e.preventDefault();
    if (!regName.trim()) {
      showToast('Customer Name is required', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: regPhonePrefill, name: regName.trim() })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setCustomer(data.customer);
        setPhoneInput(data.customer.phone);
        setShowRegModal(false);
        showToast(`Registered successfully: ${data.customer.name}!`, 'success');
        setApplyCredits(false);
        // Auto focus cart input next
        setTimeout(() => scanInputRef.current?.focus(), 100);
      } else {
        showToast(data.error || 'Registration failed', 'error');
      }
    } catch (err) {
      showToast('Network error during customer registration', 'error');
    }
  };

  // Product Scanning Code Lookup
  const handleScanProduct = async (codeToSearch = scanInput) => {
    if (!codeToSearch || codeToSearch.trim() === '') return;
    
    try {
      const res = await fetch(`${API_BASE}/products/${encodeURIComponent(codeToSearch)}`);
      const data = await res.json();
      
      if (data.found) {
        addToCart(data.product);
        setScanInput(''); // Clear scanner input
      } else {
        showToast(`Product code "${codeToSearch}" not found`, 'error');
      }
    } catch (err) {
      showToast('Database lookup failed', 'error');
    }
  };

  // Add item to cart
  const addToCart = (product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product_id === product.product_id);
      if (existing) {
        // Verify stock limits
        if (existing.quantity >= product.stock_qty) {
          showToast(`Cannot add more. Stock limit is ${product.stock_qty} units.`, 'error');
          return prevCart;
        }
        showToast(`Incremented: ${product.name}`);
        return prevCart.map((item) =>
          item.product_id === product.product_id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        // Verify stock limit
        if (product.stock_qty <= 0) {
          showToast(`Product is out of stock`, 'error');
          return prevCart;
        }
        showToast(`Added: ${product.name}`);
        return [...prevCart, { ...product, quantity: 1 }];
      }
    });
  };

  // Remove/Delete item from cart
  const removeFromCart = (productId) => {
    setCart((prevCart) => prevCart.filter((item) => item.product_id !== productId));
    showToast('Item removed from cart', 'info');
  };

  // Update item quantity directly
  const updateQuantity = (productId, newQty, stockQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty <= 0) return;
    
    if (qty > stockQty) {
      showToast(`Cannot add more than stock limit: ${stockQty} units`, 'error');
      return;
    }
    
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product_id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  // Reset checkout state
  const handleReset = () => {
    setCart([]);
    setCustomer(null);
    setPhoneInput('');
    setScanInput('');
    setApplyCredits(false);
    setActiveTx(null);
    showToast('Checkout screen cleared', 'info');
    setTimeout(() => phoneInputRef.current?.focus(), 100);
  };

  // Submit checkout transaction (Earn/Redeem credits)
  const handleCheckout = async () => {
    if (cart.length === 0) {
      showToast('Cannot checkout: Cart is empty', 'error');
      return;
    }

    const body = {
      phone: customer ? customer.phone : null,
      items: cart.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity
      })),
      creditsUsed: applyCredits && customer ? customer.credit_balance : 0
    };

    try {
      const res = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        showToast('Transaction completed successfully!', 'success');
        setActiveTx(data);
        
        // Update customer balance on screen
        if (customer) {
          setCustomer((prev) => ({
            ...prev,
            credit_balance: data.new_credit_balance
          }));
        }
        
        // Refresh product stock list
        fetchProducts();
        
        // Automatically open the print dialog
        setTimeout(() => {
          window.print();
        }, 800);
      } else {
        showToast(data.error || 'Transaction failed', 'error');
      }
    } catch (err) {
      showToast('Network error during checkout process', 'error');
    }
  };

  // Billing Math Calculations (Matches Credit Engine Rules)
  const subtotal = parseFloat(cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
  const tax = parseFloat((subtotal * 0.08).toFixed(2)); // 8% sales tax
  const billTotal = parseFloat((subtotal + tax).toFixed(2));
  
  // Credits deduction preview
  const maxAvailableCredits = customer ? customer.credit_balance : 0;
  const creditsAppliedVal = applyCredits ? parseFloat(Math.min(maxAvailableCredits, billTotal).toFixed(2)) : 0;
  const netPayable = parseFloat(Math.max(0, billTotal - creditsAppliedVal).toFixed(2));

  // Credits Earned Rule: 5% of paid cash/card amount (pre-tax subtotal portion)
  // Credits Earned = (Subtotal - Credits Redeemed) * 0.05
  const preTaxCreditBase = Math.max(0, subtotal - creditsAppliedVal);
  const creditsEarnedVal = parseFloat((preTaxCreditBase * 0.05).toFixed(2));

  // Keyboard Shortcuts Registration (F1, F2, F3, F4, Escape)
  const keyboardCallbacks = React.useMemo(() => ({
    'F1': () => phoneInputRef.current?.focus(),
    'F2': () => scanInputRef.current?.focus(),
    'F3': () => {
      if (customer && customer.credit_balance > 0) {
        setApplyCredits((prev) => !prev);
        showToast(applyCredits ? 'Loyalty credits removed' : 'Loyalty credits applied', 'info');
      } else {
        showToast('No customer loyalty balance checked-in to apply credits', 'error');
      }
    },
    'F4': () => handleCheckout(),
    'Escape': () => handleReset()
  }), [customer, cart, applyCredits, handleCheckout]);

  useKeyboardShortcuts(keyboardCallbacks);

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {notification && (
        <div className={`notification ${notification.type} no-print`}>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Quick Register Modal */}
      {showRegModal && (
        <div className="modal-overlay no-print">
          <form className="modal-content" onSubmit={handleRegisterCustomer}>
            <div className="modal-header">New Customer Loyalty Profile</div>
            
            <div className="form-group">
              <label className="input-label">Phone Number</label>
              <input 
                type="text" 
                className="form-input" 
                value={regPhonePrefill} 
                disabled 
              />
            </div>

            <div className="form-group">
              <label className="input-label">Customer Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Enter Full Name" 
                value={regName} 
                onChange={(e) => setRegName(e.target.value)} 
                required 
                autoFocus 
              />
            </div>

            <div className="modal-actions">
              <button 
                type="button" 
                className="btn btn-reset" 
                onClick={() => setShowRegModal(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-credits applied"
              >
                Register & Check-In
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction Receipt Modal (Receipt displays on top of interface and is configured for window.print()) */}
      {activeTx && (
        <div className="modal-overlay">
          <div className="modal-content receipt-modal-container" style={{ width: 'auto', background: 'transparent', border: 'none', boxShadow: 'none' }}>
            <div className="receipt-container">
              <div className="receipt-header">
                <div className="receipt-store-name">CREDIT-POS SUPERMARKET</div>
                <div style={{ fontSize: '11px' }}>123 Smart Checkout Ave, Local</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>Phone: (555) 019-9000</div>
              </div>

              <div className="receipt-divider"></div>

              <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                <div>Receipt ID: {activeTx.tx_id}</div>
                <div>Date: {new Date(activeTx.timestamp).toLocaleString()}</div>
                {customer && (
                  <>
                    <div style={{ marginTop: '4px', fontWeight: 'bold' }}>Loyalty Account:</div>
                    <div>Name: {customer.name}</div>
                    <div>Phone: {customer.phone}</div>
                  </>
                )}
              </div>

              <div className="receipt-divider"></div>

              {/* Items List */}
              {activeTx.items.map((item, idx) => (
                <div key={idx} className="receipt-item-row">
                  <div>
                    {item.name} x{item.quantity}
                  </div>
                  <div className="price-val">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}

              <div className="receipt-divider"></div>

              {/* Financial calculations */}
              <div className="receipt-summary-row">
                <div>SUBTOTAL</div>
                <div>${activeTx.subtotal.toFixed(2)}</div>
              </div>
              <div className="receipt-summary-row" style={{ fontWeight: 'normal', fontSize: '12px' }}>
                <div>SALES TAX (8%)</div>
                <div>${activeTx.tax.toFixed(2)}</div>
              </div>
              <div className="receipt-summary-row">
                <div>TOTAL BILL</div>
                <div>${activeTx.total.toFixed(2)}</div>
              </div>
              
              {activeTx.credits_used > 0 && (
                <div className="receipt-summary-row" style={{ color: '#000', fontWeight: 'normal', fontSize: '12px' }}>
                  <div>LOYALTY CREDITS REDEEMED</div>
                  <div>-${activeTx.credits_used.toFixed(2)}</div>
                </div>
              )}
              
              <div className="receipt-summary-row" style={{ borderTop: '1px double black', paddingTop: '4px', marginTop: '4px', fontSize: '14px' }}>
                <div>NET CASH PAID</div>
                <div>${activeTx.cash_paid.toFixed(2)}</div>
              </div>

              {customer && (
                <>
                  <div className="receipt-divider"></div>
                  <div className="receipt-summary-row" style={{ fontSize: '11px', fontWeight: 'normal' }}>
                    <div>Credits Earned Today:</div>
                    <div>+${activeTx.credits_earned.toFixed(2)}</div>
                  </div>
                  <div className="receipt-summary-row" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    <div>Total Credit Balance:</div>
                    <div>${activeTx.new_credit_balance.toFixed(2)}</div>
                  </div>
                </>
              )}

              <div className="receipt-divider"></div>

              <div className="receipt-footer">
                <div>THANK YOU FOR SHOPPING!</div>
                <div>Loyalty pays back 5% in digital wallet.</div>
                <div style={{ marginTop: '8px', fontStyle: 'italic' }}>Visit again soon!</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'center' }} className="no-print">
              <button 
                className="btn btn-credits" 
                style={{ width: '120px' }}
                onClick={() => window.print()}
              >
                Print Again
              </button>
              <button 
                className="btn btn-pay" 
                style={{ width: '120px' }}
                onClick={handleReset}
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Panel */}
      <header className="app-header no-print">
        <div className="logo-section">
          <div className="logo-badge">CREDIT-POS</div>
          <h1 className="logo-title">Loyalty Checkout Dashboard</h1>
        </div>

        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'checkout' ? 'active' : ''}`}
            onClick={() => setActiveTab('checkout')}
          >
            🛒 Checkout Terminal {cart.length > 0 && `(${cart.reduce((s, i) => s + i.quantity, 0)})`}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            👥 Customer Directory
          </button>
          <button 
            className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            📦 Product Catalog
          </button>
        </div>

        <div className="shortcuts-legend">
          <div><span className="shortcut-tag">F1</span>Customer</div>
          {activeTab === 'checkout' && (
            <>
              <div><span className="shortcut-tag">F2</span>Scan Item</div>
              <div><span className="shortcut-tag">F3</span>Toggle Credits</div>
              <div><span className="shortcut-tag">F4</span>Pay & Print</div>
            </>
          )}
          <div><span className="shortcut-tag">ESC</span>Clear Screen</div>
        </div>
      </header>

      {/* Core Panels Grid / Customer Tab Panel / Product Tab Panel */}
      {activeTab === 'checkout' && (
        <div className="panels-grid no-print">
          
          {/* Top Panel: Customer Check-In */}
          <section className="top-panel">
            <div className="customer-search-box">
              <label className="input-label">Customer Check-in / Phone Number</label>
              <div className="search-input-wrapper">
                <input
                  ref={phoneInputRef}
                  type="text"
                  className="phone-input"
                  placeholder="Type phone number and hit Enter..."
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomerLookup()}
                  disabled={searchLoading}
                />
                <button 
                  className="btn btn-credits" 
                  style={{ position: 'absolute', right: '40px', width: 'auto', padding: '6px 12px', fontSize: '13px', borderRadius: '6px' }}
                  onClick={() => handleCustomerLookup()}
                  disabled={searchLoading}
                >
                  Lookup
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              {customer ? (
                <div className="customer-info-card">
                  <div className="info-group">
                    <span className="input-label" style={{ letterSpacing: '0.8px', fontSize: '10px' }}>Customer Name</span>
                    <span className="info-value">{customer.name}</span>
                  </div>
                  <div className="loyalty-badge">
                    <span className="loyalty-icon">💳</span>
                    <div className="info-group">
                      <span className="input-label" style={{ color: 'rgba(6, 182, 212, 0.7)', fontSize: '10px' }}>Wallet Balance</span>
                      <span className="loyalty-val">${customer.credit_balance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="customer-info-card" style={{ opacity: 0.6, borderStyle: 'dashed' }}>
                  <span className="text-muted" style={{ fontSize: '14px' }}>No Loyalty Account Active (Checkout as Guest)</span>
                </div>
              )}
            </div>
          </section>

          {/* Middle Left Panel: Interactive Cart */}
          <section className="cart-panel">
            <div className="product-scan-section">
              <label className="input-label">Product SKU / Code Entry</label>
              <div className="scan-input-wrapper">
                <input
                  ref={scanInputRef}
                  type="text"
                  className="scan-input"
                  placeholder="Scan barcode or type item code and hit Enter..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanProduct()}
                />
              </div>
              
              {/* Quick click catalog for testing */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                <span className="text-muted" style={{ fontSize: '11px', display: 'flex', alignItems: 'center' }}>Quick Catalog:</span>
                {allProducts.slice(0, 5).map((prod) => (
                  <button
                    key={prod.product_id}
                    onClick={() => addToCart(prod)}
                    className="shortcut-tag"
                    style={{ cursor: 'pointer', background: 'rgba(99, 102, 241, 0.15)', borderColor: 'var(--accent-primary)', fontSize: '11px', padding: '3px 8px' }}
                  >
                    +{prod.name} (${prod.price})
                  </button>
                ))}
              </div>
            </div>

            <div className="cart-table-wrapper">
              {cart.length > 0 ? (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Product Name</th>
                      <th>Price</th>
                      <th style={{ width: '120px' }}>Quantity</th>
                      <th>Total</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.product_id}>
                        <td className="product-code">{item.product_id}</td>
                        <td className="product-name-col">{item.name}</td>
                        <td className="price-val">${item.price.toFixed(2)}</td>
                        <td>
                          <div className="qty-controls">
                            <button 
                              className="qty-btn"
                              onClick={() => updateQuantity(item.product_id, item.quantity - 1, item.stock_qty)}
                              disabled={item.quantity <= 1}
                            >
                              -
                            </button>
                            <input
                              type="text"
                              className="qty-input"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.product_id, e.target.value, item.stock_qty)}
                            />
                            <button 
                              className="qty-btn"
                              onClick={() => updateQuantity(item.product_id, item.quantity + 1, item.stock_qty)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="price-val" style={{ fontWeight: 'bold' }}>
                          ${(item.price * item.quantity).toFixed(2)}
                        </td>
                        <td>
                          <button 
                            className="delete-btn"
                            onClick={() => removeFromCart(item.product_id)}
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-cart-state">
                  <span className="empty-icon">🛒</span>
                  <span>Cart is currently empty. Use the input field above to scan items.</span>
                </div>
              )}
            </div>
          </section>

          {/* Middle Right Panel: Bill Summary & Actions */}
          <section className="summary-panel">
            <div className="bill-rows">
              <h3 className="input-label" style={{ marginBottom: '4px', fontSize: '13px' }}>Billing Statement</h3>
              
              <div className="bill-row">
                <span>Subtotal</span>
                <span className="row-val">${subtotal.toFixed(2)}</span>
              </div>
              
              <div className="bill-row">
                <span>Sales Tax (8.0%)</span>
                <span className="row-val">${tax.toFixed(2)}</span>
              </div>

              <div className="bill-row" style={{ borderBottom: '1px dashed rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
                <span>Total Bill Amount</span>
                <span className="row-val">${billTotal.toFixed(2)}</span>
              </div>

              {customer && (
                <div className="bill-row" style={{ color: 'var(--accent-cyan)' }}>
                  <span>Wallet Balance</span>
                  <span className="row-val cyan">${customer.credit_balance.toFixed(2)}</span>
                </div>
              )}

              {applyCredits && customer && (
                <div className="bill-row" style={{ color: '#f43f5e', fontWeight: 'bold' }}>
                  <span>Loyalty Credits Redeemed</span>
                  <span className="row-val" style={{ color: '#f43f5e' }}>-${creditsAppliedVal.toFixed(2)}</span>
                </div>
              )}

              <div className="bill-row total-row">
                <span>Net Cash Payable</span>
                <span className="row-val large-total">${netPayable.toFixed(2)}</span>
              </div>

              {customer && (
                <div className="bill-row loyalty-earn-row">
                  <span>Loyalty Credits to Earn (5%)</span>
                  <span className="row-val cyan">+${creditsEarnedVal.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="action-buttons">
              <button
                className={`btn btn-credits ${applyCredits ? 'applied' : ''}`}
                onClick={() => {
                  setApplyCredits(!applyCredits);
                  showToast(applyCredits ? 'Credits removed' : 'Credits applied', 'info');
                }}
                disabled={!customer || customer.credit_balance <= 0}
              >
                💳 Apply Wallet Credits (F3)
              </button>

              <button
                className="btn btn-pay"
                onClick={handleCheckout}
                disabled={cart.length === 0}
              >
                ✅ Process & Print Receipt (F4)
              </button>

              <button
                className="btn btn-reset"
                onClick={handleReset}
              >
                Reset Checkout Screen (ESC)
              </button>
            </div>
          </section>
          
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="cart-panel no-print" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="input-label" style={{ fontSize: '13px' }}>Customer Directory Records</label>
            <button 
              className="btn btn-credits" 
              style={{ width: 'auto', padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
              onClick={fetchCustomersList}
              disabled={customersLoading}
            >
              {customersLoading ? 'Refreshing...' : '🔄 Refresh Database'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              className="scan-input"
              placeholder="Search by customer name or phone number..."
              value={customersSearch}
              onChange={(e) => setCustomersSearch(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>

          <div className="cart-table-wrapper" style={{ marginTop: '12px' }}>
            {customersLoading ? (
              <div className="empty-cart-state">
                <span className="empty-icon">⏳</span>
                <span>Retrieving customer directory data...</span>
              </div>
            ) : filteredCustomers.length > 0 ? (
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Phone Number</th>
                    <th>Wallet Balance</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((cust, idx) => (
                    <tr key={idx}>
                      <td className="product-name-col" style={{ fontSize: '15px' }}>{cust.name}</td>
                      <td className="product-code" style={{ fontSize: '15px' }}>{cust.phone}</td>
                      <td className="price-val" style={{ color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '15px' }}>
                        ${cust.credit_balance.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-credits applied" 
                          style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', gap: '6px', borderRadius: '6px' }}
                          onClick={() => checkInCustomerFromList(cust)}
                        >
                          <span>⚡</span> Check-In
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-cart-state">
                <span className="empty-icon">👥</span>
                <span>No loyalty profiles found matching "{customersSearch}"</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="cart-panel no-print" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="input-label" style={{ fontSize: '13px' }}>Shop Product Catalog</label>
            <button 
                className="btn btn-credits" 
                style={{ width: 'auto', padding: '6px 14px', fontSize: '12px', borderRadius: '6px', marginRight: '8px' }}
                onClick={() => setShowAddModal(true)}
              >
                ➕ Add New Product
              </button>
            <button 
                className="btn btn-credits" 
                style={{ width: 'auto', padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
                onClick={fetchProducts}
              >
                🔄 Refresh Catalog
              </button>
          </div>

            {showAddModal && (
              <div className="modal-overlay no-print">
                <form className="modal-content" onSubmit={(e) => {
                  e.preventDefault();
                  // Submit new product
                  const addProduct = async () => {
                    if (!newProdId || !newProdName || !newProdPrice || !newProdStock) {
                      showToast('All fields are required', 'error');
                      return;
                    }
                    try {
                      const res = await fetch(`${API_BASE}/products`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          product_id: newProdId.trim(),
                          name: newProdName.trim(),
                          price: parseFloat(newProdPrice),
                          stock_qty: parseInt(newProdStock)
                        })
                      });
                      const data = await res.json();
                      if (res.ok && data.success) {
                        showToast('Product added successfully', 'success');
                        setShowAddModal(false);
                        // Clear fields
                        setNewProdId('');
                        setNewProdName('');
                        setNewProdPrice('');
                        setNewProdStock('');
                        // Refresh product list
                        fetchProducts();
                      } else {
                        showToast(data.error || 'Failed to add product', 'error');
                      }
                    } catch (err) {
                      showToast('Network error adding product', 'error');
                    }
                  };
                  addProduct();
                }}>
                  <div className="modal-header">Add New Product</div>
                  <div className="form-group">
                    <label className="input-label">Product ID</label>
                    <input type="text" className="form-input" value={newProdId} onChange={(e) => setNewProdId(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Name</label>
                    <input type="text" className="form-input" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Price</label>
                    <input type="number" step="0.01" className="form-input" value={newProdPrice} onChange={(e) => setNewProdPrice(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Stock Quantity</label>
                    <input type="number" className="form-input" value={newProdStock} onChange={(e) => setNewProdStock(e.target.value)} required />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-reset" onClick={() => setShowAddModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-credits applied">Add Product</button>
                  </div>
                </form>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                className="scan-input"
                placeholder="Search products by name or SKU code..."
                value={productsSearch}
                onChange={(e) => setProductsSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

          <div className="cart-table-wrapper" style={{ marginTop: '12px' }}>
            {filteredProducts.length > 0 ? (
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>SKU Code</th>
                    <th>Product Name</th>
                    <th>Price</th>
                    <th>Stock Quantity</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((prod) => {
                    const isLowStock = prod.stock_qty <= 10 && prod.stock_qty > 0;
                    const isOutOfStock = prod.stock_qty === 0;
                    
                    return (
                      <tr key={prod.product_id}>
                        <td className="product-code" style={{ fontSize: '15px' }}>{prod.product_id}</td>
                        <td className="product-name-col" style={{ fontSize: '15px' }}>{prod.name}</td>
                        <td className="price-val" style={{ fontSize: '15px' }}>
                          ${prod.price.toFixed(2)}
                        </td>
                        <td>
                          {isOutOfStock ? (
                            <span style={{ color: 'var(--accent-danger)', fontWeight: 'bold' }}>Out of Stock</span>
                          ) : isLowStock ? (
                            <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>Low Stock ({prod.stock_qty})</span>
                          ) : (
                            <span style={{ color: 'var(--accent-success)', fontWeight: '500' }}>{prod.stock_qty} available</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn btn-pay" 
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))', textTransform: 'none', boxShadow: 'none' }}
                            onClick={() => addToCart(prod)}
                            disabled={isOutOfStock}
                          >
                            ➕ Add to Cart
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-cart-state">
                <span className="empty-icon">📦</span>
                <span>No products found matching "{productsSearch}"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
