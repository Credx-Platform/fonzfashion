(function (root) {
  'use strict';
  const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  const KEY = 'fonz.cart.v1';
  function normalize(rows, products) {
    if (!Array.isArray(rows)) return [];
    const result = [];
    for (const row of rows) {
      if (!row || !products.some(p => p.slug === row.slug) || !SIZES.includes(row.size)) continue;
      if (!Number.isInteger(row.quantity) || row.quantity < 1) continue;
      const existing = result.find(r => r.slug === row.slug && r.size === row.size);
      if (existing) existing.quantity = Math.min(20, existing.quantity + row.quantity);
      else result.push({slug: row.slug, size: row.size, quantity: Math.min(20, row.quantity)});
    }
    return result;
  }
  function subtotal(rows, products) {
    return normalize(rows, products).reduce((sum, row) => sum + Math.round(products.find(p => p.slug === row.slug).price * 100) * row.quantity, 0);
  }
  function mount(products) {
    let rows = [];
    try { rows = normalize(JSON.parse(localStorage.getItem(KEY)), products); } catch {}
    const dialog = document.getElementById('cartDialog');
    const list = document.getElementById('cartItems');
    const money = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
    function render() {
      list.replaceChildren();
      for (const row of rows) {
        const p = products.find(p => p.slug === row.slug);
        const item = document.createElement('li');
        const label = document.createElement('p');
        label.textContent = `${p.name} · ${row.size} · ${money(Math.round(p.price * 100))} each`;
        item.append(label);
        const quantity = document.createElement('input');
        quantity.type = 'number'; quantity.min = '1'; quantity.max = '20'; quantity.value = String(row.quantity);
        quantity.setAttribute('aria-label', `Quantity for ${p.name}, ${row.size}`);
        quantity.onchange = () => {
          const value = Number(quantity.value);
          if (!Number.isInteger(value) || value < 1 || value > 20) { quantity.value = String(row.quantity); return; }
          row.quantity = value; save();
        };
        const remove = document.createElement('button');
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${p.name}, ${row.size}`);
        remove.onclick = () => { rows = rows.filter(r => r !== row); save(); };
        item.append(quantity, remove); list.append(item);
      }
      if (!rows.length) { const item = document.createElement('li'); item.textContent = 'Your bag is empty.'; list.append(item); }
      document.getElementById('bag').textContent = `Bag  ${rows.reduce((n, r) => n + r.quantity, 0)}`;
      document.getElementById('cartSubtotal').textContent = money(subtotal(rows, products));
    }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(rows)); }
      catch { document.getElementById('cartNotice').textContent = 'Your browser could not save this bag. Keep this page open to retain your items.'; }
      render();
    }
    document.getElementById('bag').onclick = () => dialog.showModal();
    document.getElementById('closeCart').onclick = () => dialog.close();
    render();
    return {add(slug, size) {
      const candidate = normalize([{slug, size, quantity:1}], products)[0];
      if (!candidate) return false;
      const row = rows.find(r => r.slug === slug && r.size === size);
      if (row && row.quantity >= 20) return false;
      if (row) row.quantity++; else rows.push(candidate);
      save();
      document.getElementById('cartNotice').textContent = `${products.find(p => p.slug === slug).name} · ${size} added to your bag.`;
      return true;
    }};
  }
  const api = {normalize, subtotal, mount};
  if (typeof module !== 'undefined') module.exports = api;
  else root.FonzCart = api;
})(globalThis);
