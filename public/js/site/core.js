// Utilitários, chamada de API, montador do açaí e carrinho.
const $ = s => document.querySelector(s);
const brl = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let store = null, menu = null, cart = [], selectedSize = null, appliedCoupon = null, selectedTruffleProduct = null;
const selected = new Set();
async function api(path, opts = {}) {
  const token = localStorage.getItem('acaiCustomerToken');
  const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}
// Aviso do montador (limite de acompanhamentos, tamanho não escolhido): aparece junto dos botões, não lá no fim do formulário.
function builderMessage(text) {
  const m = $('#builder-message');
  if (!m)
    return;
  m.textContent = text || '';
  m.classList.toggle('error-message', !!text);
}
// Taxa de entrega do bairro escolhido (centavos) ou null enquanto nenhum bairro foi selecionado.
function selectedZoneFee() { const id = Number($('#zone-select')?.value || 0); const z = id && menu?.zones?.find(x => Number(x.id) === id); return z ? Number(z.fee) : null; }
function priceForBuilder() {
  if (!selectedSize)
    return 0;
  return Number(selectedSize.price) + [...selected].reduce((sum, id) => sum + Number(menu.options.find(o => o.id === id)?.price || 0), 0);
}
function renderOptions(category, target) { const opts = menu.options.filter(o => o.category === category); $(target).innerHTML = opts.map(o => `<label class="option-pill ${selected.has(o.id) ? 'chosen' : ''}"><input type="checkbox" data-option="${o.id}" ${selected.has(o.id) ? 'checked' : ''}><span>${esc(o.name)}</span>${Number(o.price) > 0 ? `<small>+ ${brl(o.price)}</small>` : '<small>Grátis</small>'}</label>`).join('') || '<p class="muted">Nenhuma opção disponível.</p>'; }
function traditionalProduct() { return menu.products.find(p => p.type !== 'truffled'); }
function renderBuilder() {
  const product = traditionalProduct();
  if (selectedSize && product.sizes.find(x => x.id === selectedSize.id)?.soldOut)
    selectedSize = null;
  $('#sizes').innerHTML = product.sizes.map((s, i) => `<label class="size-card ${selectedSize?.id === s.id ? 'chosen' : ''}${s.soldOut ? ' sold-out' : ''}"><input type="radio" name="size" data-size="${s.id}" ${selectedSize?.id === s.id ? 'checked' : ''}${s.soldOut ? ' disabled' : ''}><span>${esc(s.name)}</span><strong>${s.soldOut ? 'Esgotado' : brl(s.price)}</strong></label>`).join('');
  renderOptions('topping', '#toppings');
  renderOptions('syrup', '#syrups');
  renderOptions('extra', '#extras');
  renderOptions('mousse', '#mousses');
  $('#topping-counter').textContent = `${[...selected].filter(id => menu.options.find(o => o.id === id)?.category === 'topping').length}/${store.maxFreeToppings}`;
  $('#unit-price').textContent = brl(priceForBuilder());
}
function renderCart() { const count = cart.reduce((n, i) => n + i.quantity, 0), subtotal = cart.reduce((n, i) => n + i.lineTotalCents, 0), comboDiscount = store && count >= store.comboMinItems ? Math.floor(subtotal * store.comboDiscountPercent / 100) : 0, couponDiscount = appliedCoupon?.discountCents || 0; $('#cart-count').textContent = count; $('#cart-count-side').textContent = `${count} ${count === 1 ? 'item' : 'itens'}`; $('#cart-subtotal').textContent = brl(subtotal); const fee = selectedZoneFee(), grand = Math.max(0, subtotal - comboDiscount - couponDiscount) + (fee || 0); $('#delivery-fee-row').classList.toggle('hidden', fee === null || !cart.length); $('#delivery-fee').textContent = brl(fee || 0); $('#cart-final-label').textContent = fee === null ? 'Total (sem entrega)' : 'Total com entrega'; $('#cart-final-total').textContent = brl(grand); $('#combo-discount-row').classList.toggle('hidden', comboDiscount <= 0); $('#combo-discount').textContent = '- ' + brl(comboDiscount); $('#coupon-discount-row').classList.toggle('hidden', couponDiscount <= 0); $('#coupon-discount').textContent = '- ' + brl(couponDiscount); $('#cart-items').innerHTML = cart.length ? cart.map((item, index) => `<article class="cart-item"><div><strong>${item.quantity}× ${esc(item.product || 'Açaí tradicional')} — ${esc(item.size)}</strong><p>${item.options.length ? item.options.map(o => esc(o.name)).join(', ') : 'Sem adicionais'}</p><b>${brl(item.lineTotalCents)}</b></div><button class="remove-item" data-remove="${index}" aria-label="Remover item">×</button></article>`).join('') : '<p class="muted">Seu carrinho ainda está vazio.</p>'; $('#mobile-cart-bar').classList.toggle('hidden', count === 0); $('#mobile-cart-count').textContent = `${count} ${count === 1 ? 'item' : 'itens'}`; $('#mobile-cart-total').textContent = brl(grand); saveCart(); }
function updateZones() {
  const z = $('#zone-select');
  z.innerHTML = '<option value="">Selecione seu bairro</option>' + menu.zones.map(x => `<option value="${x.id}">${esc(x.name)} — ${brl(x.fee)}</option>`).join('');
  if (!menu.zones.length)
    z.innerHTML = '<option value="">Nenhum bairro cadastrado</option>';
}
