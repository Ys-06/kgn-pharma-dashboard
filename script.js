// Import Firebase functions (single import for whole file)
import { ref, get, set, push, onValue, remove, child } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

// ---------- Bulk Retailer Upload ----------
window.importRetailersCSV = function () {
  waitForDb(async (db) => {
    const fileEl = document.getElementById('retailersCsvUpload');
    const file = fileEl?.files?.[0];
    if (!file) return alert('Select a CSV file');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
      for (const ln of rows) {
        const cols = ln.split(',');
        // CSV format: name,email,mobile,username,password
        const [name, email, mobile, username, password] = cols;
        if (!name || !email || !mobile || !username || !password) continue;
        const retailersRef = ref(db, 'retailers');
        const newRetailerRef = push(retailersRef);
        await set(newRetailerRef, {
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          username: username.trim(),
          password: password.trim(),
          orders: {},
          payments: {}
        });
      }
      alert('Retailers imported and saved to Firebase!');
    };
    reader.readAsText(file);
  });
};

// ---------- Login Page Logic ----------
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value.trim();
  
  if (!username || !password) {
    alert('Please enter both username/email and password');
    return;
  }

  try {
    const db = window.db;
    if (!db) {
      console.error('Firebase DB not initialized');
      alert('Database connection error. Please try again.');
      return;
    }

    // First check distributors/admin in users
    const usersRef = ref(db, 'users');
    const usersSnap = await get(usersRef);
    
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      for (const id in users) {
        const user = users[id];
        if ((user.username === username || user.email === username) && user.password === password) {
          console.log('Found user in users/', user.role);
          if (user.role === 'distributor') {
            window.location.href = 'distributor_dashboard.html';
            return;
          }
        }
      }
    }

    // Then check retailers
    const retailersRef = ref(db, 'retailers');
    const retailersSnap = await get(retailersRef);
    
      if (retailersSnap.exists()) {
        const retailers = retailersSnap.val();
        for (const id in retailers) {
          const retailer = retailers[id];
          if ((retailer.username === username || retailer.email === username) && retailer.password === password) {
            console.log('Found user in retailers/');
            // Store retailer info in sessionStorage
            sessionStorage.setItem('userId', id);
            sessionStorage.setItem('username', retailer.username);
            sessionStorage.setItem('userRole', 'retailer');
            window.location.href = 'retailer_dashboard.html';
            return;
          }
        }
      }    // If we get here, no match was found
    alert('Invalid username/email or password');
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Error during login. Please try again.');
  }
}

// Initialize login logic if on login page
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
});

// Wait for window.db to be available before running Firebase code
function waitForDb(callback) {
  if (window.db) {
    callback(window.db);
  } else {
    setTimeout(() => waitForDb(callback), 50);
  }
}

// ---------- Tab Navigation ----------
function openTab(e) {
  const btn = e.currentTarget || e.target;
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.tab;
  document.querySelectorAll('.tab-section').forEach(s => s.style.display = 'none');
  const el = document.getElementById(tab);
  if (el) el.style.display = 'block';
}
function openTabById(tabId) { const btn = document.querySelector(`.tab[data-tab="${tabId}"]`); if (btn) btn.click(); }
window.openTab = openTab;
window.openTabById = openTabById;

// ---------- Products CRUD (Firebase) ----------
// track editing product id
window._editingProductId = null;

function renderProductsTable() {
  waitForDb((db) => {
    const container = document.getElementById('productsTable');
    if (!container) return;
    const productsRef = ref(db, 'products');
    onValue(productsRef, (snapshot) => {
      const products = snapshot.val() || {};
      const rows = Object.entries(products).map(([id, p]) =>
        `<tr data-id="${id}">
          <td>${escapeHtml(p.name)}<div style="font-size:0.85em;color:#666">${escapeHtml(p.content||'')}</div></td>
          <td>${escapeHtml(p.company)}</td>
          <td>${escapeHtml(p.category||'')}</td>
          <td>${escapeHtml(p.packing||'')}</td>
          <td>MRP: ₹${p.mrp || 0}<br>PTR: ₹${p.ptr || 0}</td>
            <td>${p.qty || 0}</td>
            <td>
              <button class="btn" onclick="increaseProductQty('${id}')">Increase Qty</button>
              <button class="btn-edit" data-id="${id}">Edit</button>
              <button class="btn-delete" data-id="${id}">Delete</button>
            </td>
        </tr>`
      ).join('');
      container.innerHTML = `<table class="products"><thead><tr><th>Product</th><th>Company</th><th>Category</th><th>Packing</th><th>Price</th><th>Qty</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
    });
  });
}
  // Increase product quantity (prompt for amount and add to existing qty)
  window.increaseProductQty = function(productId) {
    waitForDb(async (db) => {
      const pRef = ref(db, 'products/' + productId);
      const snap = await get(pRef);
      if (!snap.exists()) return alert('Product not found');
      const prod = snap.val();
      const add = prompt('Enter quantity to add (positive integer)');
      if (!add) return;
      const n = parseInt(add);
      if (isNaN(n) || n <= 0) return alert('Invalid quantity');
      const newQty = (prod.qty || 0) + n;
      await set(pRef, { ...prod, qty: newQty });
      alert('Quantity updated');
    });
  };
    
    // Render products for retailer dashboard (with live stock updates)
    function renderRetailerProducts() {
      waitForDb((db) => {
        const productList = document.getElementById('productList');
        if (!productList) return;
        const productsRef = ref(db, 'products');
        onValue(productsRef, (snapshot) => {
          const products = snapshot.val() || {};
          productList.innerHTML = Object.entries(products).map(([id, p]) => {
            return `<div class="product-card">
              <div><b>${escapeHtml(p.name)}</b></div>
              <div>${escapeHtml(p.content||'')}</div>
              <div>Company: ${escapeHtml(p.company)}</div>
              <div>Category: ${escapeHtml(p.category||'')}</div>
              <div>Packing: ${escapeHtml(p.packing||'')}</div>
              <div>MRP: ₹${p.mrp || 0} | PTR: ₹${p.ptr || 0}</div>
              <div>Stock: <span style="color:${(p.qty||0)<3?'red':'inherit'}">${p.qty || 0}</span></div>
              <button class="btn" onclick="addToCart('${id}')" ${p.qty<1?'disabled':''}>Add to Cart</button>
            </div>`;
          }).join('');
        });
      });
    }
    
    // Call renderRetailerProducts on retailer dashboard load
    if (document.getElementById('productList')) {
      renderRetailerProducts();
    }
window.renderProductsTable = renderProductsTable;

window.addOrUpdateProduct = function () {
  waitForDb(async (db) => {
    const nameEl = document.getElementById('p_name');
    const companyEl = document.getElementById('p_company');
    const qtyEl = document.getElementById('p_qty');
    const contentEl = document.getElementById('p_content');
    const mrpEl = document.getElementById('p_mrp');
    const ptrEl = document.getElementById('p_ptr');
    const categoryEl = document.getElementById('p_category');
    const packingEl = document.getElementById('p_packing');
    if (!nameEl) return alert('Product form not found');
    const name = nameEl.value.trim();
    const company = (companyEl?.value || 'Unknown').trim();
    const qty = parseInt(qtyEl?.value) || 0;
    const content = contentEl?.value?.trim() || '';
    const mrp = parseFloat(mrpEl?.value) || 0;
    const ptr = parseFloat(ptrEl?.value) || 0;
    const category = categoryEl?.value || '';
    const packing = packingEl?.value || '';
    if (!name) return alert('Provide product name');

    const productsRef = ref(db, 'products');
    if (window._editingProductId) {
      // update existing
      const pRef = ref(db, 'products/' + window._editingProductId);
      await set(pRef, { name, company, qty, content, mrp, ptr, category, packing });
      window._editingProductId = null;
    } else {
      const newProductRef = push(productsRef);
      await set(newProductRef, { name, company, qty, content, mrp, ptr, category, packing });
    }
    // clear form
    nameEl.value = '';
    if (companyEl) companyEl.value = '';
    if (qtyEl) qtyEl.value = '';
    if (contentEl) contentEl.value = '';
    if (mrpEl) mrpEl.value = '';
    if (ptrEl) ptrEl.value = '';
    if (categoryEl) categoryEl.value = '';
    if (packingEl) packingEl.value = '';
  });
};

window.editProduct = function (id) {
  waitForDb(async (db) => {
    const productsRef = ref(db, 'products/' + id);
    const snapshot = await get(productsRef);
    if (!snapshot.exists()) return alert('Product not found');
    const p = snapshot.val();
    document.getElementById('p_name').value = p.name || '';
    document.getElementById('p_company').value = p.company || '';
    document.getElementById('p_qty').value = p.qty || '';
    document.getElementById('p_content').value = p.content || '';
    document.getElementById('p_mrp').value = p.mrp || '';
    document.getElementById('p_ptr').value = p.ptr || '';
    document.getElementById('p_category').value = p.category || '';
    document.getElementById('p_packing').value = p.packing || '';
    window._editingProductId = id;
  });
};

// ---------- Offers CRUD ----------
window.addOffer = function() {
  waitForDb(async (db) => {
    const title = document.getElementById('o_title')?.value?.trim();
    const desc = document.getElementById('o_desc')?.value?.trim();
    if (!title) return alert('Provide offer title');
    const offersRef = ref(db, 'offers');
    const newRef = push(offersRef);
    await set(newRef, { title, desc, createdAt: new Date().toISOString() });
    document.getElementById('o_title').value = '';
    document.getElementById('o_desc').value = '';
  });
};

function renderOffers() {
  waitForDb((db) => {
    const offersRef = ref(db, 'offers');
    onValue(offersRef, (snap) => {
      const offers = snap.val() || {};
      const tbody = document.querySelector('#offersTable tbody');
      if (!tbody) return;
      tbody.innerHTML = Object.entries(offers).map(([id,o]) => `<tr><td>${escapeHtml(o.title)}</td><td>${escapeHtml(o.desc)}</td><td><button class="btn ghost" onclick="deleteOffer('${id}')">Delete</button></td></tr>`).join('');
    });
  });
}
    
    function renderRetailerOffers() {
      waitForDb((db) => {
        const offersSection = document.getElementById('offersSection');
        if (!offersSection) return;
        offersSection.innerHTML = '<h3>Current Offers</h3><div id="offersList">Loading...</div>';
        onValue(ref(db, 'offers'), (snapshot) => {
          const offers = snapshot.val();
          const offersList = document.getElementById('offersList');
          if (!offers || Object.keys(offers).length === 0) {
            offersList.textContent = 'No offers available.';
            return;
          }
          offersList.innerHTML = Object.entries(offers).map(([id, offer]) => {
            return `<div class="offer-card"><strong>${offer.title}</strong>: ${offer.description}</div>`;
          }).join('');
        });
      });
    }
    
    // Call renderRetailerOffers on retailer dashboard load
    if (document.getElementById('offersSection')) {
      renderRetailerOffers();
    }

window.deleteOffer = function(id) {
  waitForDb(async (db) => {
    if (!confirm('Delete this offer?')) return;
    await remove(ref(db, 'offers/' + id));
  });
};

// ---------- Distributor Orders (view & update) ----------
function renderAllOrders() {
  waitForDb((db) => {
    const retailersRef = ref(db, 'retailers');
    onValue(retailersRef, (snap) => {
      const retailers = snap.val() || {};
      const container = document.getElementById('ordersList');
      if (!container) return;
      const rows = [];
      for (const rId in retailers) {
        const r = retailers[rId];
        const orders = r.orders || {};
        for (const oId in orders) {
          const o = orders[oId];
          // if order has items array (cart order)
          const itemsHtml = o.items ? (Array.isArray(o.items) ? o.items.map(it => `${escapeHtml(it.name)} x${it.quantity}`).join('<br>') : (o.productName || '')) : (o.productName || '');
          rows.push(`<div style="padding:8px;border-bottom:1px solid #eee"><b>${escapeHtml(r.name)}</b> — ${itemsHtml}<br>Total: ₹${o.total || 0} • Status: <select onchange="updateOrderStatus('${rId}','${oId}', this.value)"><option value="pending" ${o.status==='pending'?'selected':''}>pending</option><option value="delivered" ${o.status==='delivered'?'selected':''}>delivered</option></select></div>`);
        }
      }
      container.innerHTML = rows.join('') || '—';
    });
  });
}

window.updateOrderStatus = function(retailerId, orderId, status) {
  waitForDb(async (db) => {
    const orderRef = ref(db, `retailers/${retailerId}/orders/${orderId}`);
    const snap = await get(orderRef);
    if (!snap.exists()) return alert('Order not found');
    const data = snap.val();
    data.status = status;
    await set(orderRef, data);
    if (status === 'delivered') {
      // Support both cart orders (items array) and single product orders
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const prodId = item.productId || item.id;
          const qtyOrdered = item.quantity || item.qty || 1;
          if (!prodId) continue;
          const prodRef = ref(db, 'products/' + prodId);
          const prodSnap = await get(prodRef);
          if (prodSnap.exists()) {
            const prod = prodSnap.val();
            let newQty = (prod.qty || 0) - qtyOrdered;
            if (newQty < 0) newQty = 0;
            await set(prodRef, { ...prod, qty: newQty });
            if (newQty < 3) {
              alert(`Low stock for ${prod.name}: Only ${newQty} left!`);
            }
          }
        }
      } else if (data.productId) {
        // Single product order
        const prodRef = ref(db, 'products/' + data.productId);
        const prodSnap = await get(prodRef);
        if (prodSnap.exists()) {
          const prod = prodSnap.val();
          let newQty = (prod.qty || 0) - (data.quantity || 1);
          if (newQty < 0) newQty = 0;
          await set(prodRef, { ...prod, qty: newQty });
          if (newQty < 3) {
            alert(`Low stock for ${prod.name}: Only ${newQty} left!`);
          }
        }
      }
      renderLowStockList();
    }
    alert('Order status updated');
  });
// Render low stock list in dashboard
function renderLowStockList() {
  waitForDb((db) => {
    const productsRef = ref(db, 'products');
    onValue(productsRef, (snap) => {
      const products = snap.val() || {};
      const lowStock = Object.values(products).filter(p => (p.qty || 0) < 3);
      const el = document.getElementById('lowStockList');
      if (!el) return;
      if (lowStock.length === 0) {
        el.textContent = '—';
      } else {
        el.innerHTML = lowStock.map(p => `<div>${p.name} (${p.qty || 0} left)</div>`).join('');
      }
    });
  });
}

// Call renderLowStockList on dashboard load
if (document.getElementById('lowStockList')) {
  renderLowStockList();
}
};

window.deleteProduct = function (id) {
  waitForDb(async (db) => {
    if (!confirm('Delete this product?')) return;
    await remove(ref(db, 'products/' + id));
  });
};

// ---------- Retailers CRUD (Firebase) ----------
function renderRetailers() {
  waitForDb((db) => {
    const container = document.getElementById('retailersList');
    if (!container) return;
    const retailersRef = ref(db, 'retailers');
    onValue(retailersRef, (snapshot) => {
      const retailers = snapshot.val() || {};
      container.innerHTML = Object.entries(retailers).map(([id, r]) =>
        `<div class="retailer-row" data-id="${id}">
          <b>${escapeHtml(r.name)}</b> | Email: ${escapeHtml(r.email)} | Mobile: ${escapeHtml(r.mobile)} | Username: ${escapeHtml(r.username)}
          <button class="btn ghost" style="margin-left:8px;" onclick="openRetailerEditModal('${id}')">View/Edit</button>
        </div>`
      ).join('');
    });
  });
// Retailer Edit Modal logic
window.openRetailerEditModal = function(id) {
  waitForDb(async (db) => {
    const modal = document.getElementById('retailerEditModal');
    const form = document.getElementById('retailerEditForm');
    if (!modal || !form) return;
    const retailerRef = ref(db, 'retailers/' + id);
    const snap = await get(retailerRef);
    if (!snap.exists()) return alert('Retailer not found');
    const r = snap.val();
    form.dataset.id = id;
    document.getElementById('editRetailerName').value = r.name || '';
    document.getElementById('editRetailerEmail').value = r.email || '';
    document.getElementById('editRetailerMobile').value = r.mobile || r.phone || '';
    document.getElementById('editRetailerUsername').value = r.username || id;
    document.getElementById('editRetailerPassword').value = r.password || '';
    modal.style.display = 'flex';
  });
};

window.closeRetailerEditModal = function() {
  const modal = document.getElementById('retailerEditModal');
  if (modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('retailerEditForm');
  if (form) {
    form.onsubmit = function(e) {
      e.preventDefault();
      const id = form.dataset.id;
      const name = document.getElementById('editRetailerName').value.trim();
      const email = document.getElementById('editRetailerEmail').value.trim();
      const mobile = document.getElementById('editRetailerMobile').value.trim();
      const username = document.getElementById('editRetailerUsername').value.trim();
      const password = document.getElementById('editRetailerPassword').value.trim();
      if (!name || !email || !mobile || !username || !password) {
        alert('Fill all fields');
        return;
      }
      waitForDb(async (db) => {
        const retailerRef = ref(db, 'retailers/' + id);
        await set(retailerRef, {
          name,
          email,
          mobile,
          username,
          password,
          orders: {},
          payments: {}
        });
        alert('Retailer profile updated!');
        window.closeRetailerEditModal();
        if (typeof renderRetailers === 'function') renderRetailers();
      });
    };
  }
});
}
window.renderRetailers = renderRetailers;

window.addRetailerManual = async function(event) {
  event.preventDefault();
  
  const name = document.getElementById('manualRetailerName').value.trim();
  const email = document.getElementById('manualRetailerEmail').value.trim();
  const mobile = document.getElementById('manualRetailerMobile').value.trim();
  const username = document.getElementById('manualRetailerUsername').value.trim();
  const password = document.getElementById('manualRetailerPassword').value.trim();

  if (!name || !email || !mobile || !username || !password) {
    alert('Please fill all fields');
    return;
  }

  try {
    const db = window.db;
    if (!db) throw new Error('Database not connected');

    // Check if username already exists
    const retailersRef = ref(db, 'retailers');
    const snapshot = await get(retailersRef);
    
    if (snapshot.exists()) {
      const retailers = snapshot.val();
      for (const id in retailers) {
        if (retailers[id].username === username || retailers[id].email === email) {
          alert('A retailer with this username or email already exists');
          return;
        }
      }
    }

    // Add new retailer
    const newRetailerRef = push(retailersRef);
    await set(newRetailerRef, {
      name,
      email,
      mobile,
      username,
      password,
      orders: {},
      payments: {},
      dues: 0
    });

    // Clear form
    document.getElementById('manualRetailerForm').reset();
    alert('Retailer added successfully!');
    
    // Refresh list
    if (typeof renderRetailers === 'function') renderRetailers();

  } catch (error) {
    console.error('Error adding retailer:', error);
    alert('Failed to add retailer. Please try again.');
  }
};

// ---------- Settings/Profile/Logout ----------
function toggleTheme() { document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark'; }
function logout() { if (confirm('Logout?')) location.href = 'login.html'; }
window.toggleTheme = toggleTheme;
window.logout = logout;
window.saveSettings = function () {
  waitForDb(async (db) => {
    const name = document.getElementById('s_name')?.value?.trim();
    const email = document.getElementById('s_email')?.value?.trim();
    const mobile = document.getElementById('s_mobile')?.value?.trim();
    const pass = document.getElementById('s_pass')?.value?.trim();
    if (!name || !email || !mobile || !pass) {
      document.getElementById('settingsMsg').textContent = 'Please fill all fields.';
      return;
    }
    // Save to Firebase under /distributor_settings
    await set(ref(db, 'distributor_settings'), { name, email, mobile, pass });
    document.getElementById('settingsMsg').textContent = 'Settings saved!';
  });
};
window.saveProfile = function () { alert('Profile saved!'); };

// ---------- Utility ----------
function escapeHtml(s) { if (!s && s !== 0) return ''; return String(s).replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c] || c); }

// ---------- Event Delegation ----------
function setupProductsTableDelegation() {
  const container = document.getElementById('productsTable');
  if (!container) return;
  container.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('btn-edit')) {
      if (id) window.editProduct(id);
    } else if (btn.classList.contains('btn-delete')) {
      if (id) window.deleteProduct(id);
    }
  });
}

// ---------- DOM Ready ----------
document.addEventListener('DOMContentLoaded', () => {
  renderProductsTable();
  renderRetailers();
  setupProductsTableDelegation();
  // distributor extras
  if (typeof renderOffers === 'function') renderOffers();
  if (typeof renderAllOrders === 'function') renderAllOrders();
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', openTab));
});
