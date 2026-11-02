// Carrinho salvo no aparelho.
// ===== Carrinho salvo no aparelho =====
function buildCartItem(sizeId, optionIds, qty) {
  const size = menu?.products?.flatMap(p => p.sizes || []).find(x => Number(x.id) === Number(sizeId));
  if (!size)
    return null;
  const options = (optionIds || []).map(id => menu.options.find(o => Number(o.id) === Number(id))).filter(Boolean);
  const unit = Number(size.price) + options.reduce((n, o) => n + Number(o.price || 0), 0);
  return { sizeId: size.id, size: size.name, quantity: qty, optionIds: options.map(o => o.id), options, unitPriceCents: unit, lineTotalCents: unit * qty };
}
function saveCart() {
  try {
    if (!menu)
      return;
    if (!cart.length) {
      localStorage.removeItem('acaiCart');
      return;
    }
    localStorage.setItem('acaiCart', JSON.stringify({ t: Date.now(), items: cart.map(i => ({ s: i.sizeId, q: i.quantity, o: i.optionIds })) }));
  }
  catch { }
}
function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('acaiCart') || 'null');
    if (!saved || !Array.isArray(saved.items) || Date.now() - Number(saved.t || 0) > 7 * 86400000 || cart.length)
      return;
    const restored = saved.items.map(i => buildCartItem(i.s, i.o, Math.min(20, Math.max(1, Number(i.q) || 1)))).filter(Boolean);
    if (!restored.length) {
      localStorage.removeItem('acaiCart');
      return;
    }
    cart.push(...restored);
    renderCart();
    const m = $('#checkout-message');
    m.textContent = restored.length < saved.items.length ? 'Recuperamos seu pedido anterior. Alguns itens saíram do cardápio e foram removidos.' : 'Recuperamos os itens do seu pedido anterior. 💜';
    m.classList.remove('error-message');
  }
  catch { }
}
