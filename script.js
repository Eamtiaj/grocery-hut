import { 
  auth, db, collection, addDoc, getDocs, query, where, 
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut 
} from "./firebase.js";

const GroceryHut = (() => {
  let products = [];
  const cart = new Map();
  let wishlist = JSON.parse(localStorage.getItem('grocery_wishlist')) || [];
  let category = "All";
  let search = "";
  let sort = "default";
  let selectedVillage = "";
  let currentModalProductId = null;
  
  const byId = id => document.getElementById(id);
  const money = amount => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

  async function loadProducts() {
    try {
      const querySnapshot = await getDocs(collection(db, "products"));
      products = [];
      querySnapshot.forEach((doc) => products.push({ id: doc.id, ...doc.data() }));
      renderProducts();
      renderEssentials();
      updateCartUI();
    } catch (error) {
      console.error(error);
      toast("Failed to load products.");
    }
  }

  async function loadMyOrders() {
    const ordersList = byId("ordersList");
    if (!ordersList) return;
    if (!auth.currentUser) {
      ordersList.innerHTML = `<div class="empty-state"><h3>Not Signed In</h3><p>Please log in to see your orders.</p></div>`;
      return;
    }
    ordersList.innerHTML = `<p style="text-align:center; padding: 20px;">Loading your orders...</p>`;
    try {
      const q = query(collection(db, "orders"), where("userId", "==", auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        ordersList.innerHTML = `<div class="empty-state"><span style="font-size:40px;">📦</span><h3>No orders yet</h3></div>`;
        return;
      }
      let allOrders = [];
      querySnapshot.forEach(doc => allOrders.push({ id: doc.id, ...doc.data() }));
      allOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
      let ordersHtml = "";
      allOrders.forEach(order => {
        let itemsList = order.items.map(i => `${i.name} (x${i.qty})`).join(", ");
        ordersHtml += `
          <div class="order-card" style="margin-top:15px; padding:15px; border:1px solid var(--line); border-radius:10px; background:white;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
              <strong style="color:var(--forest); font-size:13px;">Order #${order.id.slice(-6).toUpperCase()}</strong>
              <span style="padding:4px 8px; background:var(--mint); color:var(--forest); border-radius:6px; font-size:10px; font-weight:800;">${order.status}</span>
            </div>
            <p style="margin:5px 0; font-size:11px; color:var(--muted);">${order.date}</p>
            <p style="margin:8px 0 5px; font-size:12px;"><strong>Items:</strong> ${itemsList}</p>
            <p style="margin:5px 0; font-size:12px;"><strong>Total:</strong> ${money(order.total)}</p>
          </div>
        `;
      });
      ordersList.innerHTML = ordersHtml;
    } catch (error) { ordersList.innerHTML = `<p style="color:red; text-align:center;">Error loading orders.</p>`; }
  }

  function renderProducts() {
    const grid = byId("productGrid");
    if (!grid) return;
    let filtered = products.filter(p => (category === "All" || p.category === category) && p.name.toLowerCase().includes(search));
    if (sort === "price-low") filtered.sort((a, b) => a.price - b.price);
    if (sort === "price-high") filtered.sort((a, b) => b.price - a.price);
    if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    grid.innerHTML = filtered.map(p => {
      const q = cart.get(p.id) || 0;
      const imageHtml = p.image ? `<img src="${p.image}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover; border-radius: 12px;">` : `<span class="product-emoji" style="font-size:50px; display:grid; place-items:center; height:100%;">${p.emoji || '🛒'}</span>`;
      return `
        <article class="product-card">
          <div class="product-image" data-open-product="${p.id}" style="cursor:pointer;">${imageHtml}</div>
          <div class="product-info">
            <p class="product-category">${p.category}</p>
            <h3 data-open-product="${p.id}" style="cursor:pointer;">${p.name}</h3>
            <p class="product-unit">${p.unit}</p>
            <div class="product-bottom">
              <strong>${money(p.price)}</strong>
              ${q ? `<div class="quantity-control"><button data-decrease="${p.id}">−</button><span>${q}</span><button data-increase="${p.id}">+</button></div>` : `<button class="add-button" data-add="${p.id}">Add +</button>`}
            </div>
          </div>
        </article>
      `;
    }).join("");
    if(byId("emptyState")) byId("emptyState").hidden = filtered.length !== 0;
  }

  function renderEssentials() {
    const grid = byId("essentialsGrid");
    if (grid) {
      grid.innerHTML = products.filter(p => p.popular).map(p => {
        const imageHtml = p.image ? `<img src="${p.image}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover; border-radius: 12px;">` : `<span class="product-emoji" style="font-size:50px; display:grid; place-items:center; height:100%;">${p.emoji || '🛒'}</span>`;
        return `
        <article class="product-card">
          <div class="product-image" data-open-product="${p.id}" style="cursor:pointer;">${imageHtml}</div>
          <div class="product-info">
            <p class="product-category">${p.category}</p>
            <h3 data-open-product="${p.id}" style="cursor:pointer;">${p.name}</h3>
            <p class="product-unit">${p.unit}</p>
            <div class="product-bottom"><strong>${money(p.price)}</strong><button class="add-button" data-add="${p.id}">Add +</button></div>
          </div>
        </article>
      `}).join("");
    }
  }

  function updateCartUI() {
    let count = 0, subtotal = 0;
    cart.forEach((q, id) => { count += q; const product = products.find(p => p.id === id); if(product) subtotal += product.price * q; });
    if(byId("cartCount")) byId("cartCount").textContent = count;
    renderProducts(); renderEssentials();
    
    if(currentModalProductId && !byId("productDialog").hidden) updateModalCartBtn();

    const contents = byId("cartContents");
    if(contents) {
      if(count === 0) {
        contents.innerHTML = `<div class="cart-empty"><span>▱</span><h3>Your basket is empty.</h3></div>`;
      } else {
        let itemsHtml = "";
        cart.forEach((q, id) => {
          const p = products.find(i => i.id === id);
          if(p) itemsHtml += `<div class="cart-item" style="padding:10px; border-bottom:1px solid #ccc;"><strong>${p.name}</strong> (${money(p.price)} x ${q}) <button data-remove="${p.id}">Remove</button></div>`;
        });
        contents.innerHTML = `${itemsHtml}<div class="cart-summary" style="margin-top:20px; font-size:16px;">Total Amount: <strong>${money(subtotal)}</strong></div><button class="primary-button full-button" id="proceedToCheckoutBtn" style="margin-top:15px;">Checkout Now</button>`;
      }
    }
  }

  function openProductModal(id) {
    const p = products.find(item => item.id === id);
    if(!p) return;
    currentModalProductId = p.id;
    
    byId("modalProductImage").src = p.image || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&q=80";
    byId("modalProductTitle").textContent = p.name;
    byId("modalProductCategory").textContent = p.category;
    byId("modalProductUnit").textContent = p.unit;
    byId("modalProductPrice").textContent = money(p.price);
    byId("modalDescName").textContent = p.name;
    
    updateWishlistHeart(); updateModalCartBtn(); openPanel("productDialog");
  }

  function updateWishlistHeart() {
    const btn = byId("wishlistBtn");
    if(wishlist.includes(currentModalProductId)) { btn.textContent = "❤️"; btn.style.color = "red"; } 
    else { btn.textContent = "🤍"; btn.style.color = "initial"; }
  }

  function updateModalCartBtn() {
    const container = byId("modalCartControls");
    const q = cart.get(currentModalProductId) || 0;
    if(q > 0) {
      container.innerHTML = `<div class="quantity-control" style="width:100%; display:flex; justify-content:center; padding:10px 0;"><button data-decrease="${currentModalProductId}" style="padding:10px 20px;">−</button><span style="padding:10px 30px; font-size:18px;">${q}</span><button data-increase="${currentModalProductId}" style="padding:10px 20px;">+</button></div>`;
    } else {
      container.innerHTML = `<button class="primary-button full-button" data-add="${currentModalProductId}">Add to Cart</button>`;
    }
  }

  function toast(msg) {
    const t = byId("toast");
    if(t) { t.textContent = msg; t.hidden = false; t.classList.add("show"); setTimeout(() => { t.hidden = true; t.classList.remove("show"); }, 3000); }
  }

  function openPanel(id) { if(byId(id)) { byId(id).hidden = false; byId("dialogBackdrop").hidden = false; } }
  function closePanels() {
    ["authDialog", "cartDrawer", "locationDialog", "checkoutDialog", "ordersDialog", "productDialog"].forEach(id => { if(byId(id)) byId(id).hidden = true; });
    if(byId("dialogBackdrop")) byId("dialogBackdrop").hidden = true; currentModalProductId = null;
  }

  function setupFirebaseAuth() {
    const phoneForm = byId("phoneForm"), otpForm = byId("otpForm"), phoneInput = byId("phoneInput"), otpInput = byId("otpInput"), authMessage = byId("authMessage"), accountLabel = byId("accountLabel");
    let confirmationResult = null, recaptchaVerifier = null;
    try { recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { 'size': 'invisible' }); } catch (e) {}

    phoneForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const phone = "+91" + phoneInput.value.trim();
      if(phone.length !== 13) return (authMessage.textContent = "Enter valid 10-digit number.");
      authMessage.textContent = "Sending OTP..."; authMessage.className = "form-message";
      signInWithPhoneNumber(auth, phone, recaptchaVerifier).then((result) => {
        confirmationResult = result; phoneForm.hidden = true; otpForm.hidden = false; authMessage.textContent = "OTP Sent!"; authMessage.className = "form-message success";
      }).catch((error) => {
        authMessage.textContent = "Failed to send OTP. Try again."; authMessage.className = "form-message error";
        if(recaptchaVerifier) recaptchaVerifier.render().then(id => window.grecaptcha.reset(id));
      });
    });

    otpForm?.addEventListener("submit", (e) => {
      e.preventDefault(); authMessage.textContent = "Verifying...";
      confirmationResult.confirm(otpInput.value.trim()).then(() => {
        authMessage.textContent = "Logged in successfully!"; authMessage.className = "form-message success";
        setTimeout(() => { closePanels(); phoneForm.reset(); otpForm.reset(); phoneForm.hidden = false; otpForm.hidden = true; authMessage.textContent = ""; toast("Welcome back!"); }, 1000);
      }).catch(() => { authMessage.textContent = "Invalid OTP."; authMessage.className = "form-message error"; });
    });

    byId("backToPhoneBtn")?.addEventListener("click", () => { otpForm.hidden = true; phoneForm.hidden = false; authMessage.textContent = ""; });

    onAuthStateChanged(auth, (user) => {
      const loginBtn = byId("loginBtn"); const newLoginBtn = loginBtn.cloneNode(true); loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
      const headerOrdersBtn = byId("headerOrdersBtn");
      if (user) {
        if(accountLabel) accountLabel.textContent = `+91 ${user.phoneNumber.slice(-4)}`;
        if(byId("customerPhone")) byId("customerPhone").value = user.phoneNumber.replace('+91','');
        if(headerOrdersBtn) headerOrdersBtn.hidden = false;
        newLoginBtn.addEventListener("click", () => { if(confirm("Do you want to log out?")) signOut(auth).then(() => { toast("Logged out"); if(headerOrdersBtn) headerOrdersBtn.hidden = true; }); });
      } else {
        if(accountLabel) accountLabel.textContent = "Sign in";
        if(headerOrdersBtn) headerOrdersBtn.hidden = true;
        newLoginBtn.addEventListener("click", () => openPanel("authDialog"));
      }
    });
  }

  function setupOrderSystem() {
    byId("checkoutForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if(cart.size === 0) return toast("Your cart is empty!");
      
      // Extra safety check before sending to Firebase
      if(!auth.currentUser) return toast("You must be logged in to order!");

      const btn = e.target.querySelector("button[type='submit']"); btn.disabled = true; btn.textContent = "Placing Order...";
      const orderItems = []; let totalAmount = 0;
      cart.forEach((q, id) => { const p = products.find(i => i.id === id); if(p) { orderItems.push({ id: p.id, name: p.name, price: p.price, qty: q }); totalAmount += p.price * q; } });
      const orderData = {
        customerName: byId("customerName").value.trim(), customerPhone: byId("customerPhone").value.trim(), village: byId("checkoutVillage").value, address: byId("customerAddress").value.trim(), note: byId("orderNote").value.trim(), items: orderItems, total: totalAmount, status: "Pending", paymentMethod: "Cash on Delivery", date: new Date().toLocaleString(),
        userId: auth.currentUser.uid // Ab guest entry band!
      };
      try {
        await addDoc(collection(db, "orders"), orderData);
        toast("Order Placed Successfully! 🎉"); cart.clear(); updateCartUI(); closePanels(); e.target.reset();
      } catch (error) { toast("Failed to place order."); } finally { btn.disabled = false; btn.textContent = "Confirm Order (Cash on Delivery)"; }
    });
  }

  function init() {
    setupFirebaseAuth(); setupOrderSystem(); loadProducts();

    document.addEventListener("click", e => {
      const add = e.target.closest("[data-add]"), inc = e.target.closest("[data-increase]"), dec = e.target.closest("[data-decrease]"), rem = e.target.closest("[data-remove]"), close = e.target.closest("[data-close]"), filter = e.target.closest("[data-filter]"), openProd = e.target.closest("[data-open-product]");
      
      if(add) { cart.set(add.dataset.add, (cart.get(add.dataset.add) || 0) + 1); toast("Added to cart"); updateCartUI(); }
      if(inc) { const id = inc.dataset.increase; cart.set(id, cart.get(id) + 1); updateCartUI(); }
      if(dec) { const id = dec.dataset.decrease; if(cart.get(id) > 1) cart.set(id, cart.get(id) - 1); else cart.delete(id); updateCartUI(); }
      if(rem) { cart.delete(rem.dataset.remove); updateCartUI(); }
      if(close) closePanels();
      if(filter) { document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active")); filter.classList.add("active"); category = filter.dataset.filter; renderProducts(); }
      if(openProd) { openProductModal(openProd.dataset.openProduct); }

      // YAHAN SECURITY ADD KI GAYI HAI 🔒
      if(e.target.id === "proceedToCheckoutBtn") {
        if (!auth.currentUser) {
          closePanels();
          toast("Please sign in to place an order!");
          openPanel("authDialog");
          return; // Yahan code ruk jayega, checkout page nahi khulega
        }
        
        closePanels(); openPanel("checkoutDialog"); let subtotal = 0;
        cart.forEach((q, id) => { const p = products.find(i => i.id === id); if(p) subtotal += p.price * q; });
        byId("checkoutSummary").innerHTML = `You are paying: <strong style="color:var(--forest)">${money(subtotal)}</strong>`;
      }
      
      if(e.target.id === "wishlistBtn" && currentModalProductId) {
         if(wishlist.includes(currentModalProductId)) {
             wishlist = wishlist.filter(id => id !== currentModalProductId); toast("Removed from wishlist");
         } else {
             wishlist.push(currentModalProductId); toast("Added to wishlist ❤️");
         }
         localStorage.setItem('grocery_wishlist', JSON.stringify(wishlist)); updateWishlistHeart();
      }

      if(e.target.id === "shareProductBtn" && currentModalProductId) {
         const p = products.find(i => i.id === currentModalProductId);
         if(p) {
             const shareText = `Check out ${p.name} for ${money(p.price)} on Grocery Hut! Order now: ${window.location.href}`;
             if (navigator.share) { navigator.share({ title: p.name, text: shareText, url: window.location.href }).catch(console.error); } 
             else { navigator.clipboard.writeText(shareText); toast("Link copied to share!"); }
         }
      }
    });

    byId("cartBtn")?.addEventListener("click", () => openPanel("cartDrawer"));
    byId("locationBtn")?.addEventListener("click", () => openPanel("locationDialog"));
    byId("saveLocationBtn")?.addEventListener("click", () => { const val = byId("villageSelect").value; if(val) { selectedVillage = val; byId("selectedLocation").textContent = val; closePanels(); toast(`Location set to ${val}`); } });
    byId("searchInput")?.addEventListener("input", e => { search = e.target.value.toLowerCase(); renderProducts(); });
    byId("sortSelect")?.addEventListener("change", e => { sort = e.target.value; renderProducts(); });
    byId("headerOrdersBtn")?.addEventListener("click", () => { closePanels(); openPanel("ordersDialog"); loadMyOrders(); });
    byId("footerOrdersBtn")?.addEventListener("click", () => { closePanels(); openPanel("ordersDialog"); loadMyOrders(); });
  }

  return { init };
})();
document.addEventListener("DOMContentLoaded", GroceryHut.init);
