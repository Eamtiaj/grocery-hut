import { 
  auth, db, collection, addDoc, getDocs, query, where, 
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
} from "./firebase.js";

const GroceryHut = (() => {
  let products = [];
  const cart = new Map();
  let wishlist = JSON.parse(localStorage.getItem('grocery_wishlist')) || [];
  let currentModalProductId = null;
  let categoryFilter = "All";
  
  const byId = id => document.getElementById(id);
  const money = amount => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

  // 1. LOAD PRODUCTS FROM FIREBASE
  async function loadProducts() {
    try {
      const qs = await getDocs(collection(db, "products"));
      products = []; 
      qs.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
      renderProducts(); 
      updateCartUI();
    } catch (e) { 
      toast("Failed to load products."); 
      console.error(e);
    }
  }

  // 2. RENDER PRODUCTS
  function renderProducts() {
    const grid = byId("productGrid"); if (!grid) return;
    const search = byId("searchInput")?.value.toLowerCase() || "";
    
    let filtered = products.filter(p => p.name.toLowerCase().includes(search));
    if (categoryFilter !== "All") {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }
    
    grid.innerHTML = filtered.map(p => {
      const q = cart.get(p.id) || 0;
      const img = p.image ? `<img src="${p.image}">` : `<span>🛒</span>`;
      return `
        <article class="product-card">
          <div class="product-image" data-open="${p.id}">${img}</div>
          <div class="product-info">
            <h3 data-open="${p.id}">${p.name}</h3>
            <p class="product-unit">${p.unit}</p>
            <div class="product-bottom">
              <strong>${money(p.price)}</strong>
              ${q ? `<div class="qty-control"><button data-dec="${p.id}">-</button><span>${q}</span><button data-inc="${p.id}">+</button></div>` 
                  : `<button class="add-btn" data-add="${p.id}">Add +</button>`}
            </div>
          </div>
        </article>`;
    }).join("");

    if(byId("emptyState")) byId("emptyState").hidden = filtered.length !== 0;
  }

  // 3. CART UI & LOGIC
  function updateCartUI() {
    let count = 0, subtotal = 0;
    cart.forEach((q, id) => { 
      count += q; 
      const p = products.find(x => x.id === id); 
      if(p) subtotal += p.price * q; 
    });
    
    if(byId("cartCount")) byId("cartCount").textContent = count;
    renderProducts();
    if(currentModalProductId && !byId("productDialog").hidden) updateModalCartBtn();

    const contents = byId("cartContents");
    if(contents) {
      if(count === 0) { 
        contents.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--muted);"><h2>Basket is empty</h2><p>Add items to start shopping</p></div>`; 
      } else {
        let html = "";
        cart.forEach((q, id) => {
          const p = products.find(x => x.id === id);
          if(p) html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:15px;">
              <div>
                <strong style="font-size:15px; color:var(--dark);">${p.name}</strong><br>
                <small style="color:var(--muted);">${money(p.price)} x ${q}</small>
              </div>
              <button data-remove="${p.id}" style="color:#d32f2f; border:none; background:rgba(211,47,47,0.1); padding:8px 12px; border-radius:8px; font-weight:bold; cursor:pointer;">Remove</button>
            </div>`;
        });
        contents.innerHTML = `${html}
          <div style="font-size:18px; margin-top:20px; display:flex; justify-content:space-between;"><span>Total Amount:</span> <strong>${money(subtotal)}</strong></div>
          <button class="btn-primary" id="proceedToCheckoutBtn" style="margin-top:20px;">Proceed to Checkout</button>`;
      }
    }
  }

  // 4. DIALOG / MODAL CONTROLS
  function openModal(id) { 
    if(byId(id)) { byId(id).hidden = false; byId("dialogBackdrop").hidden = false; }
  }
  
  function closeAll() {
    ["authDialog", "cartDrawer", "locationDialog", "checkoutDialog", "ordersDialog", "productDialog"].forEach(id => {
      if(byId(id)) byId(id).hidden = true;
    });
    if(byId("dialogBackdrop")) byId("dialogBackdrop").hidden = true; 
    currentModalProductId = null;
  }

  // 5. PRODUCT DETAILS & WISHLIST
  function openProductDetails(id) {
    const p = products.find(x => x.id === id); if(!p) return;
    currentModalProductId = p.id;
    
    byId("modalProductImage").src = p.image || "";
    byId("modalProductTitle").textContent = p.name;
    byId("modalProductCategory").textContent = p.category;
    byId("modalProductUnit").textContent = p.unit;
    byId("modalProductPrice").textContent = money(p.price);
    byId("modalDescName").textContent = p.name;
    
    const wBtn = byId("wishlistBtn");
    if(wishlist.includes(p.id)) { wBtn.textContent = "❤️"; wBtn.style.color = "red"; } 
    else { wBtn.textContent = "🤍"; wBtn.style.color = "initial"; }
    
    updateModalCartBtn(); 
    openModal("productDialog");
  }

  function updateModalCartBtn() {
    const q = cart.get(currentModalProductId) || 0;
    const c = byId("modalCartControls");
    if(q > 0) {
      c.innerHTML = `
        <div class="qty-control" style="width:100%; justify-content:center; padding:10px 0;">
          <button data-dec="${currentModalProductId}" style="padding:10px 30px;">-</button>
          <span style="font-size:18px;">${q}</span>
          <button data-inc="${currentModalProductId}" style="padding:10px 30px;">+</button>
        </div>`;
    } else {
      c.innerHTML = `<button class="btn-primary" data-add="${currentModalProductId}" style="margin:0;">Add to Cart</button>`;
    }
  }

  // 6. FIREBASE AUTH & BOTTOM NAV SECURITY
  function setupAuth() {
    let confirmResult, recaptcha;
    try { recaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', { 'size': 'invisible' }); } catch(e){}

    byId("phoneForm")?.addEventListener("submit", e => {
      e.preventDefault(); 
      const p = "+91" + byId("phoneInput").value;
      byId("authMessage").textContent = "Sending OTP...";
      signInWithPhoneNumber(auth, p, recaptcha).then(res => { 
        confirmResult = res; 
        byId("phoneForm").hidden = true; 
        byId("otpForm").hidden = false; 
        byId("authMessage").textContent = "OTP Sent!"; 
      }).catch(err => {
        byId("authMessage").textContent = "Failed. Try again.";
        console.error(err);
      });
    });

    byId("otpForm")?.addEventListener("submit", e => {
      e.preventDefault(); 
      byId("authMessage").textContent = "Verifying...";
      confirmResult.confirm(byId("otpInput").value).then(() => { 
        toast("Logged in successfully!"); 
        closeAll(); 
      }).catch(() => byId("authMessage").textContent = "Invalid OTP");
    });

    byId("backToPhoneBtn")?.addEventListener("click", () => {
      byId("otpForm").hidden = true;
      byId("phoneForm").hidden = false;
      byId("authMessage").textContent = "";
    });

    onAuthStateChanged(auth, user => {
      const authItems = document.querySelectorAll(".auth-required");
      const loginBtn = byId("loginBtn");
      
      // Clone to remove old listeners securely
      const newLoginBtn = loginBtn.cloneNode(true); 
      loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);

      if (user) {
        byId("accountLabel").textContent = "My Account";
        if(byId("customerPhone")) byId("customerPhone").value = user.phoneNumber.replace('+91','');
        
        // Show protected bottom nav items
        authItems.forEach(item => item.style.display = 'flex');
        
        newLoginBtn.addEventListener("click", () => { 
          if(confirm("Do you want to log out?")) signOut(auth).then(()=> toast("Logged out")); 
        });
      } else {
        byId("accountLabel").textContent = "Sign in";
        
        // Hide protected bottom nav items
        authItems.forEach(item => item.style.display = 'none');
        
        newLoginBtn.addEventListener("click", () => openModal("authDialog"));
      }
    });
  }

  // 7. LOAD ORDERS
  async function loadMyOrders() {
    if(!auth.currentUser) return;
    const ordersList = byId("ordersList");
    ordersList.innerHTML = "<p style='text-align:center; margin-top:20px;'>Loading...</p>";
    
    try {
      const qs = await getDocs(query(collection(db, "orders"), where("userId", "==", auth.currentUser.uid)));
      if(qs.empty) { 
        ordersList.innerHTML = `<div style='text-align:center; padding:30px; color:var(--muted);'><h3>No orders yet</h3></div>`; 
        return; 
      }
      
      let allOrders = [];
      qs.forEach(d => allOrders.push({id: d.id, ...d.data()}));
      allOrders.sort((a,b) => new Date(b.date) - new Date(a.date));
      
      let html = ""; 
      allOrders.forEach(o => { 
        let itemsStr = o.items.map(i => `${i.name} (x${i.qty})`).join(", ");
        html += `
          <div style="border:1px solid var(--border); padding:15px; margin-bottom:15px; border-radius:12px; background:white;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
              <strong style="color:var(--forest);">Order #${o.id.slice(-6).toUpperCase()}</strong>
              <span style="background:var(--mint); color:var(--forest); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800;">${o.status}</span>
            </div>
            <p style="font-size:12px; color:var(--muted); margin-bottom:8px;">${o.date}</p>
            <p style="font-size:13px; margin-bottom:8px;"><strong>Items:</strong> ${itemsStr}</p>
            <p style="font-size:14px;"><strong>Total:</strong> ${money(o.total)}</p>
          </div>`; 
      });
      ordersList.innerHTML = html;
    } catch(e) {
      ordersList.innerHTML = "<p style='color:red;'>Error loading orders.</p>";
    }
  }

  function toast(msg) { 
    const t = byId("toast"); 
    t.textContent = msg; 
    t.hidden = false; 
    t.classList.add("show"); 
    setTimeout(() => { t.classList.remove("show"); t.hidden = true; }, 3000); 
  }

  // 8. EVENT DELEGATION & INIT
  function init() {
    setupAuth(); 
    loadProducts();
    
    document.addEventListener("click", e => {
      const t = e.target;
      
      // Cart Controls
      if(t.closest("[data-add]")) { const id = t.closest("[data-add]").dataset.add; cart.set(id, (cart.get(id)||0)+1); toast("Added to Basket!"); updateCartUI(); }
      if(t.closest("[data-inc]")) { const id = t.closest("[data-inc]").dataset.inc; cart.set(id, cart.get(id)+1); updateCartUI(); }
      if(t.closest("[data-dec]")) { const id = t.closest("[data-dec]").dataset.dec; if(cart.get(id)>1) cart.set(id, cart.get(id)-1); else cart.delete(id); updateCartUI(); }
      if(t.closest("[data-remove]")) { cart.delete(t.closest("[data-remove]").dataset.remove); updateCartUI(); }
      
      // Modal Controls
      if(t.closest("[data-close]")) closeAll();
      if(t.closest("[data-open]")) openProductDetails(t.closest("[data-open]").dataset.open);
      
      // Category Filter Chips
      if(t.closest(".filter-chip")) {
        const chip = t.closest(".filter-chip");
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        categoryFilter = chip.dataset.filter;
        renderProducts();
      }
      
      // Security: Login check before checkout
      if(t.id === "proceedToCheckoutBtn") {
        if(!auth.currentUser) { 
          closeAll(); 
          toast("Please sign in to place an order!"); 
          openModal("authDialog"); 
          return; 
        }
        closeAll(); 
        let sub = 0; 
        cart.forEach((q, id) => { sub += products.find(x => x.id === id).price * q; });
        byId("checkoutSummary").innerHTML = `You are paying: <strong style="color:var(--forest)">${money(sub)}</strong>`; 
        openModal("checkoutDialog");
      }
      
      // Wishlist & Share logic
      if(t.closest("#wishlistBtn") && currentModalProductId) {
        if(wishlist.includes(currentModalProductId)) { 
          wishlist = wishlist.filter(x => x !== currentModalProductId); 
          toast("Removed from Wishlist"); 
        } else { 
          wishlist.push(currentModalProductId); 
          toast("Added to Wishlist ❤️"); 
        }
        localStorage.setItem('grocery_wishlist', JSON.stringify(wishlist)); 
        openProductDetails(currentModalProductId);
      }
      
      if(t.id === "shareProductBtn" && currentModalProductId) {
         const p = products.find(i => i.id === currentModalProductId);
         if(p) {
             const shareText = `Check out ${p.name} on Grocery Hut! Order now: ${window.location.href}`;
             if (navigator.share) { navigator.share({ title: p.name, text: shareText, url: window.location.href }).catch(console.error); } 
             else { navigator.clipboard.writeText(shareText); toast("Link copied!"); }
         }
      }
    });

    // Inputs & Listeners
    byId("searchInput")?.addEventListener("input", renderProducts);
    
    // Bottom Nav & Top Bar Listeners
    byId("cartBtn")?.addEventListener("click", () => { closeAll(); openModal("cartDrawer"); });
    byId("navOrdersBtn")?.addEventListener("click", () => { closeAll(); openModal("ordersDialog"); loadMyOrders(); });
    byId("navWishlistBtn")?.addEventListener("click", () => { toast("Wishlist items will appear here soon!"); });
    byId("navHomeBtn")?.addEventListener("click", closeAll);
    
    byId("locationBtn")?.addEventListener("click", () => openModal("locationDialog"));
    byId("saveLocationBtn")?.addEventListener("click", () => { 
      const val = byId("villageSelect").value;
      if(val) {
        byId("selectedLocation").textContent = val + " ⌄"; 
        closeAll(); 
        toast(`Location set to ${val}`);
      }
    });

    // Place Order Form Submission
    byId("checkoutForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      if(!auth.currentUser) return;
      
      const btn = e.target.querySelector("button"); 
      btn.disabled = true; btn.textContent = "Placing Order...";
      
      let items = [], total = 0; 
      cart.forEach((q, id) => { 
        const p = products.find(x => x.id === id); 
        items.push({ id: p.id, name: p.name, qty: q, price: p.price}); 
        total += p.price * q; 
      });
      
      try {
        await addDoc(collection(db, "orders"), { 
          userId: auth.currentUser.uid, 
          customerName: byId("customerName").value, 
          customerPhone: byId("customerPhone").value,
          village: byId("checkoutVillage").value,
          address: byId("customerAddress").value, 
          note: byId("orderNote").value,
          items, 
          total, 
          status: "Pending", 
          date: new Date().toLocaleString() 
        });
        toast("Order Placed Successfully! 🎉"); 
        cart.clear(); updateCartUI(); closeAll(); e.target.reset();
      } catch(e) { 
        toast("Error placing order"); 
        console.error(e);
      } finally { 
        btn.disabled = false; btn.textContent = "Place Order (COD)"; 
      }
    });
  }
  
  return { init };
})();
document.addEventListener("DOMContentLoaded", GroceryHut.init);
