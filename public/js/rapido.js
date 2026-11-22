// Pedido rápido (QR code na loja): cardápio + nome + observações. Sem endereço, telefone, pagamento ou cupom.
// Os preços aqui são só uma prévia: o servidor refaz toda a conta (POST /api/quick-orders) e a resposta dele é a que vale.
const $ = s => document.querySelector(s);
const brl = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LAYER_DISCOUNT_CENTS = 100, MAX_LAYERS = 20;
const CATEGORY_LABEL = { traditional: '🥣 Açaís Tradicionais', truffled: '🍫 Açaís Trufados', ice_cream: '🍦 Sorvetes' };
const FLAVOR_TITLE = { truffled: 'Escolha o sabor do trufado', ice_cream: 'Escolha o sabor do sorvete' };
let store = null, menu = null, category = 'traditional', product = null, size = null, submitting = false;
const chosen = new Set(), layers = new Map();
let cart = [];

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(data.error || 'Não foi possível concluir. Tente de novo.');
  return data;
}
const isLayered = o => (o.category === 'extra' || o.category === 'mousse') && Number(o.price) > 0;
const layerCount = id => Math.min(MAX_LAYERS, Math.max(1, Math.trunc(Number(layers.get(id)) || 1)));
const layerPrice = (price, n) => { const base = Math.max(0, Number(price) || 0); return base + (Math.max(1, n) - 1) * Math.max(0, base - LAYER_DISCOUNT_CENTS); };
const optionById = id => menu.options.find(o => o.id === id);
const hasOptions = () => category !== 'truffled';
const productsOf = type => menu.products.filter(p => (p.type || 'traditional') === type && Array.isArray(p.sizes) && p.sizes.length);
const unitPrice = () => size ? Number(size.price) + (hasOptions() ? [...chosen].reduce((n, id) => { const o = optionById(id); return n + (o ? (isLayered(o) ? layerPrice(o.price, layerCount(id)) : Number(o.price)) : 0); }, 0) : 0) : 0;
function builderMessage(text) { $('#q-builder-msg').textContent = text || ''; }

function currentProduct() {
  if (category === 'traditional')
    return productsOf('traditional')[0] || null;
  return productsOf(category).find(p => p.id === product?.id) || null;
}
function resetBuilder() {
  size = null;
  chosen.clear();
  layers.clear();
  builderMessage('');
}
function renderTabs() {
  const cats = ['traditional', 'truffled', 'ice_cream'].filter(c => productsOf(c).length);
  const tabs = $('#q-tabs');
  tabs.classList.toggle('hidden', cats.length < 2);
  tabs.innerHTML = cats.map(c => `<button type="button" class="q-tab" role="tab" data-category="${c}" aria-selected="${c === category}">${CATEGORY_LABEL[c]}</button>`).join('');
}
function renderBuilder() {
  const flavorCard = $('#q-flavor-card'), withFlavors = category !== 'traditional';
  flavorCard.classList.toggle('hidden', !withFlavors);
  if (withFlavors) {
    $('#q-flavor-title').textContent = FLAVOR_TITLE[category];
    $('#q-flavors').innerHTML = productsOf(category).map(p => {
      const out = p.sizes.every(s => s.soldOut);
      return `<button type="button" class="q-choice ${product?.id === p.id ? 'chosen' : ''} ${out ? 'sold-out' : ''}" data-product="${p.id}" ${out ? 'disabled' : ''}><strong>${esc(p.name)}</strong>${p.description ? `<span>${esc(p.description)}</span>` : ''}${out ? '<span>Esgotado</span>' : ''}</button>`;
    }).join('');
  }
  const p = currentProduct();
  const sizes = p ? p.sizes : [];
  $('#q-size-card').classList.toggle('hidden', withFlavors && !p);
  if (size && !sizes.some(s => s.id === size.id && !s.soldOut))
    size = null;
  $('#q-sizes').innerHTML = sizes.length ? sizes.map(s => `<button type="button" class="q-choice ${size?.id === s.id ? 'chosen' : ''} ${s.soldOut ? 'sold-out' : ''}" data-size="${s.id}" ${s.soldOut ? 'disabled' : ''}><strong>${esc(s.name)}</strong><span class="q-price">${brl(s.price)}</span>${s.soldOut ? '<span>Esgotado</span>' : s.stockLabel ? `<span>${esc(s.stockLabel)}</span>` : ''}</button>`).join('') : '<p class="q-muted">Indisponível no momento.</p>';
  const showExtras = !!size && hasOptions();
  $('#q-extras-cards').classList.toggle('hidden', !showExtras);
  if (showExtras)
    renderOptions();
  $('#q-add-bar').classList.toggle('hidden', !size);
  $('#q-unit-price').textContent = brl(unitPrice());
}
function pill(o) {
  const on = chosen.has(o.id), price = Number(o.price) > 0 ? ` <small>+ ${brl(o.price)}</small>` : '';
  const btn = `<button type="button" class="q-pill ${on ? 'chosen' : ''}" data-option="${o.id}" aria-pressed="${on}">${esc(o.name)}${price}</button>`;
  if (on && isLayered(o))
    return `<span class="q-pill-wrap">${btn}<label class="q-muted">Camadas <input class="q-layers" type="number" min="1" max="5" inputmode="numeric" value="${layerCount(o.id)}" data-layers="${o.id}" aria-label="Camadas de ${esc(o.name)}"></label></span>`;
  return btn;
}
function renderOptions() {
  const by = cat => menu.options.filter(o => o.category === cat);
  const fill = (target, list) => { $(target).innerHTML = list.map(pill).join('') || '<p class="q-muted">Nenhuma opção disponível.</p>'; };
  fill('#q-toppings', by('topping'));
  fill('#q-syrups', by('syrup'));
  const paid = [...by('extra'), ...by('mousse')];
  $('#q-paid-card').classList.toggle('hidden', !paid.length);
  $('#q-extras').innerHTML = by('extra').map(pill).join('');
  $('#q-mousses').innerHTML = by('mousse').map(pill).join('');
  const max = Number(store.maxFreeToppings ?? 5), n = [...chosen].filter(id => optionById(id)?.category === 'topping').length;
  $('#q-topping-counter').textContent = `${n}/${max}`;
}
function toggleOption(id) {
  const o = optionById(id);
  if (!o)
    return;
  builderMessage('');
  if (chosen.has(id)) {
    chosen.delete(id);
    layers.delete(id);
  }
  else if (o.category === 'topping') {
    const max = Number(store.maxFreeToppings ?? 5);
    if ([...chosen].filter(x => optionById(x)?.category === 'topping').length >= max)
      return builderMessage(`Você pode escolher até ${max} acompanhamentos grátis por copo.`);
    chosen.add(id);
  }
  else if (o.category === 'syrup') {
    // Só uma calda grátis por copo: escolher outra troca a anterior.
    [...chosen].filter(x => optionById(x)?.category === 'syrup').forEach(x => chosen.delete(x));
    chosen.add(id);
  }
  else
    chosen.add(id);
  renderBuilder();
}

// ===== Pedido (carrinho) =====
const cartSubtotal = () => cart.reduce((n, i) => n + i.unitCents * i.quantity, 0);
const cartCount = () => cart.reduce((n, i) => n + i.quantity, 0);
function comboEstimate() {
  const min = Number(store.comboMinItems || 2), pct = Number(store.comboDiscountPercent || 0);
  return cartCount() >= min && pct > 0 ? Math.floor(cartSubtotal() * pct / 100) : 0;
}
function renderCart() {
  const host = $('#q-cart-items');
  host.innerHTML = cart.length ? cart.map((i, idx) => `<div class="q-cart-line"><div><b>${i.quantity}× ${esc(i.productName)} — ${esc(i.sizeName)}</b>${i.optionsText ? `<small>${esc(i.optionsText)}</small>` : ''}<small>${brl(i.unitCents * i.quantity)}</small></div><button type="button" class="q-remove" data-remove="${idx}" aria-label="Remover ${esc(i.productName)}">Remover</button></div>`).join('') : '<p class="q-muted">Nada por aqui ainda. Escolha um item acima e toque em “Adicionar ao pedido”.</p>';
  const combo = comboEstimate();
  $('#q-combo-row').classList.toggle('hidden', !combo);
  $('#q-combo').textContent = '- ' + brl(combo);
  $('#q-total').textContent = brl(cartSubtotal() - combo);
}
function addToCart() {
  if (!size)
    return builderMessage('Escolha o tamanho antes de adicionar.');
  const quantity = Math.min(20, Math.max(1, Number($('#q-quantity').value) || 1));
  const opts = hasOptions() ? [...chosen].map(optionById).filter(Boolean) : [];
  const optionLayers = Object.fromEntries(opts.filter(isLayered).map(o => [o.id, layerCount(o.id)]).filter(([, n]) => n > 1));
  const optionsText = opts.map(o => o.name + (optionLayers[o.id] ? ` (${optionLayers[o.id]} camadas)` : '')).join(', ');
  cart.push({ sizeId: size.id, quantity, optionIds: opts.map(o => o.id), optionLayers, productName: currentProduct()?.name || size.product_name || 'Açaí', sizeName: size.name, optionsText, unitCents: unitPrice() });
  resetBuilder();
  if (category !== 'traditional')
    product = null;
  $('#q-quantity').value = '1';
  renderBuilder();
  renderCart();
  $('#q-cart-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== Envio =====
async function submitOrder(e) {
  e.preventDefault();
  if (submitting)
    return;
  const msg = $('#q-form-msg'), name = $('#q-name').value.trim();
  msg.textContent = '';
  if (!cart.length)
    return void (msg.textContent = 'Adicione pelo menos um item ao pedido.');
  if (name.length < 2)
    return void ($('#q-name').focus(), msg.textContent = 'Digite seu nome para podermos te chamar.');
  submitting = true;
  const btn = $('#q-submit');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const order = await api('/quick-orders', { method: 'POST', body: JSON.stringify({ customerName: name, notes: $('#q-notes').value.trim(), items: cart.map(({ sizeId, quantity, optionIds, optionLayers }) => ({ sizeId, quantity, optionIds, optionLayers })) }) });
    showDone(order);
  }
  catch (err) {
    msg.textContent = err.message;
    // Cardápio pode ter mudado (item esgotado): recarrega para o cliente ver o que ainda está disponível.
    loadMenu().catch(() => { });
  }
  finally {
    submitting = false;
    btn.disabled = false;
    btn.textContent = 'Enviar pedido';
  }
}
function showDone(order) {
  $('#q-order').classList.add('hidden');
  $('#q-done').classList.remove('hidden');
  $('#q-done-name').textContent = `${order.customerName}, recebemos seu pedido.`;
  $('#q-done-code').textContent = order.orderCode;
  $('#q-done-items').innerHTML = (order.items || []).map(i => `<div class="q-cart-line"><div><b>${esc(i.quantity)}× ${esc(i.product)} — ${esc(i.size)}</b>${(i.options || []).length ? `<small>${esc(i.options.map(o => o.name + (Number(o.layers) > 1 ? ` (${o.layers} camadas)` : '')).join(', '))}</small>` : ''}</div><strong>${brl(i.lineTotalCents)}</strong></div>`).join('');
  $('#q-done-total').textContent = brl(order.totalCents);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function newOrder() {
  cart = [];
  $('#q-notes').value = '';
  $('#q-form-msg').textContent = '';
  $('#q-done').classList.add('hidden');
  $('#q-order').classList.remove('hidden');
  resetBuilder();
  renderBuilder();
  renderCart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Carga =====
async function loadMenu() {
  [store, menu] = await Promise.all([api('/store'), api('/menu')]);
  const status = $('#q-status');
  if (!store.quickOrdersEnabled) {
    status.textContent = 'Os pedidos rápidos estão desligados no momento. Faça seu pedido direto no balcão. 💜';
    status.className = 'q-notice q-off';
    $('#q-order').classList.add('hidden');
    return;
  }
  status.className = 'q-notice hidden';
  if ($('#q-done').classList.contains('hidden'))
    $('#q-order').classList.remove('hidden');
  if (!productsOf(category).length)
    category = ['traditional', 'truffled', 'ice_cream'].find(c => productsOf(c).length) || 'traditional';
  renderTabs();
  renderBuilder();
  renderCart();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-category],[data-product],[data-size],[data-option],[data-remove],#q-add,#q-again');
  if (!t || !menu)
    return;
  if (t.dataset.category) {
    category = t.dataset.category;
    product = null;
    resetBuilder();
    renderTabs();
    renderBuilder();
  }
  else if (t.dataset.product) {
    product = productsOf(category).find(p => p.id === Number(t.dataset.product)) || null;
    size = null;
    renderBuilder();
  }
  else if (t.dataset.size) {
    size = currentProduct()?.sizes.find(s => s.id === Number(t.dataset.size)) || null;
    builderMessage('');
    renderBuilder();
  }
  else if (t.dataset.option)
    toggleOption(Number(t.dataset.option));
  else if (t.dataset.remove !== undefined) {
    cart.splice(Number(t.dataset.remove), 1);
    renderCart();
  }
  else if (t.id === 'q-add')
    addToCart();
  else if (t.id === 'q-again')
    newOrder();
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-layers]')) {
    const n = Math.min(5, Math.max(1, Math.trunc(Number(e.target.value)) || 1));
    layers.set(Number(e.target.dataset.layers), n);
    // Não redesenha a tela aqui: este evento chega durante o "blur" do campo e o navegador acusa erro se o campo for trocado nesse momento.
    e.target.value = n;
    $('#q-unit-price').textContent = brl(unitPrice());
  }
});
document.addEventListener('DOMContentLoaded', () => {
  $('#q-quantity').innerHTML = Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  $('#q-form').addEventListener('submit', submitOrder);
  loadMenu().catch(err => {
    const status = $('#q-status');
    status.textContent = 'Não foi possível carregar o cardápio agora. Faça seu pedido no balcão ou tente de novo em instantes. ' + (err.message || '');
    status.className = 'q-notice q-off';
  });
});
