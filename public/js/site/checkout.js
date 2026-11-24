// Carregamento do cardápio, carrinho, cupom, envio do pedido, passo do WhatsApp e Pix.
let truffleQuantity = 1;
let truffleSizeId = null;
async function load() {
  try {
    [store, menu] = await Promise.all([api('/store'), api('/menu')]);
    $('#store-status').textContent = store.openNow ? '🟢 Aberto para pedidos imediatos · ' + store.openingTime + ' às ' + store.closingTime : '🟣 No momento estamos fechados para pedidos imediatos. Você pode agendar.';
    paintStoreBanner();
    $('#delivery-estimate').textContent = `Previsão estimada: ${store.estimatedMinutesMin} a ${store.estimatedMinutesMax} minutos após a confirmação.`;
    if (!menu.products.length)
      throw new Error('O cardápio está indisponível.');
    const traditional = traditionalProduct();
    const hasTraditional = Boolean(traditional && Array.isArray(traditional.sizes) && traditional.sizes.length);
    const available = ['traditional', 'truffled', 'ice_cream'].filter(type => type === 'traditional' ? hasTraditional : type === 'ice_cream' ? iceCreamProducts().length : flavorProducts(type).length);
    if (!available.length)
      throw new Error('Nenhum produto com tamanho disponível foi encontrado.');
    selectedSize = hasTraditional ? traditional.sizes.find(size => !size.soldOut) || traditional.sizes[0] : null;
    $('#menu-status').classList.remove('error-message');
    $('#menu-status').classList.add('hidden');
    $('#builder').classList.remove('hidden');
    renderBuilder();
    renderTruffledMenu();
    // Mostra as abas só quando há mais de uma categoria; abre na primeira disponível (o açaí tradicional, se existir).
    document.querySelectorAll('[data-menu-category]').forEach(tab => {
      const type = tab.dataset.menuCategory, active = type === available[0];
      tab.classList.toggle('hidden', !available.includes(type));
      tab.classList.toggle('button-primary', active);
      tab.classList.toggle('button-outline', !active);
      tab.setAttribute('aria-pressed', String(active));
    });
    $('#menu-category-tabs').classList.toggle('hidden', available.length < 2);
    showMenuCategory(available[0]);
    updateZones();
    restoreSavedDetails();
    restoreCart();
    renderCart();
    renderFavorites();
    paintCartNote();
    syncOrderTimeOptions();
    showPendingWhatsappBanner();
  }
  catch (e) {
    const status = $('#menu-status');
    const message = document.createElement('span');
    message.textContent = e.message + ' Confira a conexão e tente novamente.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button button-primary';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      retry.textContent = 'Tentando novamente…';
      load();
    }, { once: true });
    status.replaceChildren(message, retry);
    status.classList.add('error-message');
  }
  await loadReviews();
}
// Aviso de estoque por unidade no card do sabor: esgotado em todos os tamanhos, ou algum tamanho nas últimas unidades.
function truffleFlavorBadge(p) {
  if (p.sizes.every(size => size.soldOut)) return '<em class="stock-badge stock-badge-out">Esgotado</em>';
  if (p.sizes.some(size => size.stockLabel && !size.soldOut)) return '<em class="stock-badge">🔥 Últimas unidades!</em>';
  return '';
}
// Categorias de "sabor + tamanho" com receita pronta e sem adicionais (trufados). O sorvete usa o montador do açaí.
const FLAVOR_CATEGORIES = {
  truffled: { menu: '#truffled-menu', flavors: '#truffled-flavors', sizes: '#truffled-sizes', empty: 'Nenhum sabor trufado disponível no momento.' }
};
const isFlavorProduct = p => Object.hasOwn(FLAVOR_CATEGORIES, p.type);
const flavorProducts = type => menu.products.filter(p => p.type === type && Array.isArray(p.sizes) && p.sizes.length);
// Troca a categoria visível: o montador (açaí tradicional ou sorvete) ou o cardápio de sabores prontos.
function showMenuCategory(type) {
  const builderType = type === 'traditional' || type === 'ice_cream';
  // Saindo do montador para os trufados: o que já foi montado entra no pedido (nada se perde sem o cliente perceber).
  if (!builderType) commitPendingDraft({ announce: true });
  if (builderType) setBuilderCategory(type);
  $('.builder-main').classList.toggle('hidden', !builderType);
  for (const [key, cfg] of Object.entries(FLAVOR_CATEGORIES))
    $(cfg.menu).classList.toggle('hidden', key !== type);
  if (!builderType) renderTruffledMenu();
}
// Troca entre açaí e sorvete no montador: o que já estava montado entra no pedido e o montador recomeça em branco.
function setBuilderCategory(type) {
  if (builderCategory === type) return;
  commitPendingDraft({ announce: true });
  builderCategory = type;
  freshBuilder();
}
function renderTruffledMenu() {
  for (const [type, cfg] of Object.entries(FLAVOR_CATEGORIES)) {
    const products = flavorProducts(type);
    $(cfg.flavors).innerHTML = products.length ? products.map(p => `<button type="button" class="truffled-flavor-card ${selectedTruffleProduct?.id === p.id ? 'chosen' : ''}" data-truffle-flavor="${p.id}">${truffleFlavorBadge(p)}${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}<strong>${esc(p.name)}</strong><span>Escolher tamanho →</span></button>`).join('') : `<p class="muted">${cfg.empty}</p>`;
  }
}
// Texto do botão de adicionar do trufado: mostra o total (quantidade × tamanho) assim que o tamanho é escolhido.
function truffleAddLabel(product) {
  const size = product?.sizes?.find(x => x.id === truffleSizeId);
  return size ? `+ Adicionar ao pedido · ${brl(Number(size.price) * truffleQuantity)}` : 'Escolha um tamanho para adicionar';
}
function renderTruffledSizes() {
  for (const [type, cfg] of Object.entries(FLAVOR_CATEGORIES)) {
    const panel = $(cfg.sizes), product = selectedTruffleProduct;
    if (!product || product.type !== type || !Array.isArray(product.sizes) || !product.sizes.length) { panel.classList.add('hidden'); panel.innerHTML = ''; continue; }
    // Tamanho que esgotou enquanto o cliente olhava deixa de estar escolhido.
    if (truffleSizeId && !product.sizes.some(x => x.id === truffleSizeId && !x.soldOut)) truffleSizeId = null;
    panel.classList.remove('hidden');
    const quantityOptions = Array.from({ length: 20 }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === truffleQuantity ? 'selected' : ''}>${n}</option>`).join('');
    panel.innerHTML = `<h3>${esc(product.name)}</h3><div class="truffled-quantity-row"><label for="truffle-quantity">Quantidade</label><select id="truffle-quantity">${quantityOptions}</select></div><p class="muted">Agora escolha o tamanho:</p><div class="size-grid">${product.sizes.map(size => `<button type="button" class="size-card ${size.soldOut ? 'sold-out' : ''} ${size.id === truffleSizeId ? 'chosen' : ''}" data-truffle-size="${size.id}" aria-pressed="${size.id === truffleSizeId}" ${size.soldOut ? 'disabled' : ''}><span>${esc(size.name)}</span><strong>${size.soldOut ? 'Esgotado' : brl(size.price)}</strong>${size.stockLabel && !size.soldOut ? `<em class="stock-badge">${esc(size.stockLabel)}</em>` : ''}</button>`).join('')}</div><button type="button" class="button button-green button-full truffle-add" id="truffle-add" data-truffle-add ${truffleSizeId ? '' : 'disabled'}>${esc(truffleAddLabel(product))}</button><p class="form-message" id="truffle-message" role="status"></p>`;
  }
}
function truffleMessage(text) {
  const m = $('#truffle-message');
  if (!m) return;
  m.textContent = text || '';
  m.classList.toggle('error-message', !!text);
}
// Depois de um pedido recusado por falta de unidade, atualiza só os de sabor pronto (trufados e sorvetes; os tradicionais ficam como estão, para não mexer no montador).
async function refreshTruffleStock() {
  try {
    const fresh = await api('/menu');
    menu.products = menu.products.map(p => isFlavorProduct(p) ? (fresh.products.find(f => f.id === p.id) || p) : p);
    if (selectedTruffleProduct) selectedTruffleProduct = menu.products.find(p => p.id === selectedTruffleProduct.id) || null;
    renderTruffledMenu(); renderTruffledSizes();
  }
  catch { /* sem rede: o servidor continua conferindo na hora do pedido */ }
}
document.addEventListener('click', e => {
  const category = e.target.closest('[data-menu-category]');
  if (category) {
    document.querySelectorAll('[data-menu-category]').forEach(b => {
      const active = b === category;
      b.classList.toggle('button-primary', active);
      b.classList.toggle('button-outline', !active);
      b.setAttribute('aria-pressed', String(active));
    });
    showMenuCategory(category.dataset.menuCategory);
    return;
  }
  const flavor = e.target.closest('[data-truffle-flavor]');
  if (flavor) {
    selectedTruffleProduct = menu.products.find(p => p.id === Number(flavor.dataset.truffleFlavor));
    truffleSizeId = null;
    announceAdded('');
    renderTruffledMenu(); renderTruffledSizes();
    scrollRespectingMotion($('#truffled-sizes'), { behavior: 'smooth', block: 'nearest' });
    return;
  }
  // Escolher o tamanho só marca a opção; quem coloca no pedido é o botão "Adicionar ao pedido".
  const truffleSize = e.target.closest('[data-truffle-size]');
  if (truffleSize && selectedTruffleProduct) {
    const size = selectedTruffleProduct.sizes.find(x => x.id === Number(truffleSize.dataset.truffleSize));
    if (!size || size.soldOut) return;
    truffleSizeId = size.id;
    renderTruffledSizes();
    return;
  }
  if (e.target.closest('[data-truffle-add]') && selectedTruffleProduct) addTruffleToOrder();
});
// Coloca o trufado escolhido no pedido e deixa o cliente livre para escolher mais itens (outra categoria, outro sabor ou ir ao pedido).
function addTruffleToOrder() {
  const product = selectedTruffleProduct, size = product?.sizes?.find(x => x.id === truffleSizeId);
  if (!product || !size || size.soldOut) { truffleMessage('Escolha um tamanho para adicionar ao pedido.'); return; }
  const quantity = Math.min(20, Math.max(1, Math.trunc(Number($('#truffle-quantity')?.value || truffleQuantity || 1))));
  // Estoque por unidade: não deixa o carrinho passar do que a loja tem (o servidor confere de novo ao fechar o pedido).
  if (size.stock !== null && size.stock !== undefined) {
    const inCart = cart.filter(item => item.sizeId === size.id).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (inCart + quantity > size.stock) {
      truffleMessage(inCart ? `Você já tem ${inCart} no pedido e só temos ${size.stock} unidade${size.stock === 1 ? '' : 's'} desse tamanho.` : `Só temos ${size.stock} unidade${size.stock === 1 ? '' : 's'} desse tamanho. Diminua a quantidade.`);
      return;
    }
  }
  cart.push({ sizeId: size.id, product: product.name, size: size.name, quantity, optionIds: [], options: [], unitPriceCents: Number(size.price), lineTotalCents: Number(size.price) * quantity });
  couponNeedsRecheck();
  // Recomeça a escolha de trufados: o item já está no pedido.
  selectedTruffleProduct = null; truffleSizeId = null; truffleQuantity = 1;
  renderTruffledMenu(); renderTruffledSizes();
  renderCart();
  announceAdded(`✓ ${quantity}× ${product.name} ${size.name} adicionado ao pedido.`);
  document.dispatchEvent(new CustomEvent('acai:item-added'));
}
document.addEventListener('change', e => {
  if (e.target.matches('#truffle-quantity')) {
    truffleQuantity = Math.min(20, Math.max(1, Math.trunc(Number(e.target.value) || 1)));
    const addBtn = $('#truffle-add');
    if (addBtn) addBtn.textContent = truffleAddLabel(selectedTruffleProduct);
    return;
  }
  if (e.target.matches('[data-size]')) {
    selectedSize = builderProduct()?.sizes.find(s => s.id === Number(e.target.dataset.size)) || null;
    renderBuilder();
    syncDraft();
  }
  if (e.target.matches('[data-ice-flavor]')) {
    selectedIceCream = iceCreamProducts().find(p => p.id === Number(e.target.dataset.iceFlavor)) || null;
    // Mantém o mesmo tamanho (pelo nome) quando o novo sabor também o tem; senão o cliente escolhe de novo.
    const keep = selectedSize && selectedIceCream?.sizes.find(x => x.name === selectedSize.name && !x.soldOut);
    selectedSize = keep || null;
    builderMessage('');
    renderBuilder();
    syncDraft();
  }
  if (e.target.matches('#half-ice-toggle')) {
    halfIceOn = e.target.checked;
    if (!halfIceOn) selectedHalfIce = null;
    builderMessage(halfIceOn ? 'Escolha o sabor do sorvete da outra metade.' : '');
    renderBuilder();
    syncDraft();
  }
  if (e.target.matches('[data-half-flavor]')) {
    selectedHalfIce = iceCreamProducts().find(p => p.id === Number(e.target.dataset.halfFlavor)) || null;
    builderMessage('');
    renderBuilder();
    syncDraft();
  }
  if (e.target.matches('[data-option]')) {
    builderMessage('');
    const id = Number(e.target.dataset.option), opt = menu.options.find(o => o.id === id);
    if (e.target.checked) {
      if (opt.category === 'syrup') {
        menu.options.filter(o => o.category === 'syrup').forEach(o => selected.delete(o.id));
      }
      if (opt.category === 'topping' && [...selected].filter(i => menu.options.find(o => o.id === i)?.category === 'topping').length >= store.maxFreeToppings) {
        e.target.checked = false;
        builderMessage(`Você pode escolher até ${store.maxFreeToppings} acompanhamentos grátis.`);
        return;
      }
      selected.add(id);
      if (isLayered(opt))
        selectedLayers.set(id, 1);
    }
    else {
      selected.delete(id);
      selectedLayers.delete(id);
    }
    renderBuilder();
    syncDraft();
  }
  if (e.target.matches('#builder-quantity'))
    syncDraft();
});
// Campo de camadas (só números). Enquanto digita, atualiza os preços sem redesenhar a tela (para não perder o foco).
document.addEventListener('input', e => {
  if (!e.target.matches('[data-layers]'))
    return;
  const id = Number(e.target.dataset.layers), opt = menu.options.find(o => o.id === id);
  const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
  if (digits !== e.target.value)
    e.target.value = digits;
  let n = Number(digits);
  if (n > MAX_LAYERS) {
    n = MAX_LAYERS;
    e.target.value = String(n);
    builderMessage(`O máximo é ${MAX_LAYERS} camadas por adicional.`);
  }
  else
    builderMessage('');
  // Campo vazio ou 0 conta como 1 camada até o cliente sair do campo.
  selectedLayers.set(id, Math.max(1, n));
  const total = document.querySelector(`[data-layers-total="${id}"]`);
  if (total && opt)
    total.textContent = brl(layerPrice(opt.price, layerCountOf(id)));
  $('#unit-price').textContent = brl(priceForBuilder());
  syncDraft();
});
document.addEventListener('focusout', e => {
  if (e.target.matches?.('[data-layers]')) {
    e.target.value = String(layerCountOf(Number(e.target.dataset.layers)));
    syncDraft();
  }
});
// Clicar no tamanho que já está marcado não dispara "change": conta como escolha do cliente.
document.addEventListener('click', e => {
  if (e.target.matches?.('[data-size]') && selectedSize && Number(e.target.dataset.size) === selectedSize.id)
    syncDraft();
});
document.addEventListener('click', e => {
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    cart.splice(Number(remove.dataset.remove), 1);
    appliedCoupon = null;
    $('#coupon-message').textContent = '';
    renderCart();
  }
});
// O açaí ou sorvete que o cliente está montando fica num "rascunho" e só entra no pedido quando ele toca em
// "Adicionar ao pedido". Depois de adicionar, o montador recomeça em branco e o cliente escolhe o próximo item
// (açaí, trufado ou sorvete) sem sair do cardápio; no fim, toca em "Ir para o pedido" e paga tudo de uma vez.
let draftTouched = false;
// Aviso verde "✓ ... adicionado ao pedido" na barra de baixo (aparece em todas as categorias).
function announceAdded(text) {
  const el = $('#builder-added-message');
  if (el) el.textContent = text || '';
}
// Mudou o pedido: um cupom já aplicado precisa ser validado de novo.
function couponNeedsRecheck() {
  if (!appliedCoupon) return;
  appliedCoupon = null;
  $('#coupon-message').textContent = 'O pedido mudou. Aplique o cupom novamente.';
  $('#coupon-message').classList.remove('is-success');
}
function paintCartNote() {
  const note = $('#builder-cart-note');
  if (!note) return;
  const count = cart.reduce((n, i) => n + i.quantity, 0), ice = builderCategory === 'ice_cream';
  note.classList.toggle('is-in-cart', count > 0);
  note.textContent = count
    ? `🛒 Seu pedido já tem ${count} ${count === 1 ? 'item' : 'itens'}. Toque em “Adicionar ao pedido” para incluir ${ice ? 'este sorvete' : 'este açaí'} ou em “Finalizar pedido” para fechar a compra.`
    : `Escolha ${ice ? 'o sabor, o tamanho' : 'o tamanho'} e os acompanhamentos e toque em “Adicionar ao pedido”. Dá para juntar açaí, trufado e sorvete no mesmo pedido.`;
}
function resetBuilder() {
  draftTouched = false;
  halfIceOn = false;
  selectedHalfIce = null;
  selected.clear();
  selectedLayers.clear();
  const q = $('#builder-quantity');
  if (q) q.value = '1';
  if (menu) renderBuilder();
  paintCartNote();
}
// Montador em branco para o próximo item: sem sabor de sorvete escolhido e com o primeiro tamanho disponível.
function freshBuilder() {
  selectedIceCream = null;
  const product = builderProduct();
  selectedSize = product ? product.sizes.find(size => !size.soldOut) || product.sizes[0] : null;
  resetBuilder();
}
// O item que está na tela do montador (ou null enquanto faltar escolher o tamanho, o sabor ou a metade sorvete).
function draftData() {
  if (!menu || !selectedSize || halfPending()) return null;
  const product = builderProduct();
  if (!product) return null;
  const opts = [...selected].map(id => menu.options.find(o => o.id === id)).filter(Boolean);
  const unit = priceForBuilder(), quantity = Math.max(1, Number($('#builder-quantity').value || 1));
  const optionLayers = layersObject(opts.filter(isLayered).map(o => o.id), layerCountOf);
  const half = halfIceProduct();
  return { sizeId: selectedSize.id, product: product.name, halfIceCreamId: half ? half.id : null, halfIceCream: half ? { id: half.id, name: half.name } : null, size: selectedSize.name, quantity, optionIds: opts.map(o => o.id), optionLayers, options: opts, unitPriceCents: unit, lineTotalCents: unit * quantity };
}
// O cliente mexeu no montador. Ainda não está no pedido: só entra ao tocar em "Adicionar ao pedido".
function syncDraft() {
  draftTouched = true;
  announceAdded('');
  paintCartNote();
}
// Coloca no pedido o que está no montador e deixa o montador pronto para o próximo item. Devolve false se ainda falta escolher algo.
function commitDraft({ announce = true } = {}) {
  const data = draftData();
  if (!data) return false;
  cart.push(data);
  couponNeedsRecheck();
  freshBuilder();
  renderCart();
  if (announce) announceAdded(`✓ ${data.quantity}× ${data.product} ${data.size}${data.halfIceCream ? ` (${halfLabel(data.halfIceCream)})` : ''} adicionado ao pedido.`);
  return true;
}
// Rede de segurança: se o cliente mexeu no montador e foi para outra aba ou para o pedido sem tocar em "Adicionar",
// o item entra no pedido (e o aviso verde mostra isso) em vez de ficar para trás sem ele perceber.
function commitPendingDraft({ announce = false } = {}) {
  return draftTouched ? commitDraft({ announce }) : false;
}
// "Adicionar ao pedido" do açaí/sorvete.
function addCurrentToOrder() {
  if (!commitDraft({ announce: true })) return false;
  document.dispatchEvent(new CustomEvent('acai:item-added'));
  return true;
}
$('#add-to-order').addEventListener('click', () => {
  if (!addCurrentToOrder()) builderMessage(needSizeMessage());
});
// Botão "Ir para o pedido" do montador (só aparece sozinho se a tela de passos não carregar).
$('#view-order').addEventListener('click', () => {
  commitPendingDraft();
  if (!cart.length) { builderMessage(needSizeMessage()); return; }
  builderMessage('');
  scrollRespectingMotion($('#pedido'), { behavior: 'smooth', block: 'start' });
});
$('#zone-select').addEventListener('change', renderCart);
// Entrega x retirada: na retirada some endereço e bairro (não são obrigatórios) e o frete é zero.
function syncFulfillment() {
  const pickup = isPickup();
  $('#address-label').classList.toggle('hidden', pickup);
  $('#zone-label').classList.toggle('hidden', pickup);
  $('#address-input').required = !pickup;
  $('#zone-select').required = !pickup;
  $('#pickup-note').classList.toggle('hidden', !pickup);
  $('#checkout-heading').textContent = pickup ? 'Retirada' : 'Entrega';
  $('#order-time-label').textContent = pickup ? 'Quando deseja retirar?' : 'Quando deseja receber?';
  renderCart();
}
$('#fulfillment').addEventListener('change', syncFulfillment);
// Colheres: botões − / + e campo numérico (de 0 até store.maxSpoons), R$ 0,10 cada.
const setSpoons = n => { $('#spoon-quantity').value = String(Math.min(maxSpoons(), Math.max(0, n))); renderCart(); };
$('#spoon-minus').addEventListener('click', () => setSpoons(spoonCount() - 1));
$('#spoon-plus').addEventListener('click', () => setSpoons(spoonCount() + 1));
$('#spoon-quantity').addEventListener('input', renderCart);
$('#spoon-quantity').addEventListener('change', () => setSpoons(spoonCount()));
$('#payment-method').addEventListener('change', e => {
  const cash = e.target.value === 'Dinheiro';
  $('#cash-change-fields').classList.toggle('hidden', !cash);
  $('#needs-change').required = cash;
  if (!cash) {
    $('#needs-change').value = '';
    $('#change-for').value = '';
    $('#change-for-label').classList.add('hidden');
    $('#change-for').required = false;
  }
});
$('#needs-change').addEventListener('change', e => {
  const needs = e.target.value === 'yes';
  $('#change-for-label').classList.toggle('hidden', !needs);
  $('#change-for').required = needs;
  if (!needs)
    $('#change-for').value = '';
});
// Agendamento: o servidor entrega só os dias e horários em que a loja abre (aba Funcionamento do painel).
let scheduleDays = [];
function paintScheduleTimes() {
  const day = scheduleDays.find(d => d.date === $('#schedule-day').value), time = $('#schedule-time');
  time.innerHTML = (day ? day.slots : []).map(s => `<option value="${esc(s.value)}">${esc(s.time)}</option>`).join('');
  $('#scheduled-for').value = time.value || '';
}
async function loadScheduleSlots() {
  const dayEl = $('#schedule-day'), timeEl = $('#schedule-time'), hint = $('#schedule-hint');
  hint.textContent = 'Carregando horários…';
  dayEl.disabled = timeEl.disabled = true;
  dayEl.required = timeEl.required = false;
  $('#scheduled-for').value = '';
  try {
    const data = await api('/schedule-slots');
    scheduleDays = data.days || [];
    dayEl.innerHTML = scheduleDays.map(d => `<option value="${esc(d.date)}">${esc(d.label)}</option>`).join('');
    if (!scheduleDays.length) {
      timeEl.innerHTML = '';
      hint.textContent = 'Não há horários disponíveis para agendar no momento. Fale com a loja pelo WhatsApp.';
      return;
    }
    hint.textContent = `Horários disponíveis dentro do funcionamento da loja (${data.openingTime} às ${data.closingTime}).`;
    dayEl.disabled = timeEl.disabled = false;
    dayEl.required = timeEl.required = true;
    paintScheduleTimes();
  }
  catch (err) {
    scheduleDays = [];
    dayEl.innerHTML = timeEl.innerHTML = '';
    hint.textContent = 'Não foi possível carregar os horários. Verifique a conexão e tente novamente.';
  }
}
$('#schedule-day').addEventListener('change', paintScheduleTimes);
$('#schedule-time').addEventListener('change', () => { $('#scheduled-for').value = $('#schedule-time').value || ''; });
$('#order-time').addEventListener('change', e => {
  const scheduled = e.target.value === 'scheduled';
  $('#schedule-label').classList.toggle('hidden', !scheduled);
  if (scheduled)
    loadScheduleSlots();
  else
    $('#scheduled-for').value = '';
});
$('#apply-coupon').addEventListener('click', async () => {
  const code = $('#coupon-code').value.trim().toUpperCase(), msg = $('#coupon-message'), subtotal = cart.reduce((sum, i) => sum + i.lineTotalCents, 0), itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  msg.textContent = '';
  if (!code) {
    msg.textContent = 'Digite o código do cupom.';
    return;
  }
  if (!cart.length) {
    msg.textContent = 'Adicione itens ao carrinho antes de aplicar o cupom.';
    return;
  }
  try {
    const c = await api(`/coupons/validate?code=${encodeURIComponent(code)}&subtotalCents=${subtotal}&itemCount=${itemCount}`);
    appliedCoupon = c;
    msg.textContent = `Cupom aplicado! Desconto de ${brl(c.discountCents)}.`;
    msg.classList.remove('error-message');
    msg.classList.add('is-success');
    renderCart();
  }
  catch (err) {
    appliedCoupon = null;
    msg.textContent = err.message;
    msg.classList.remove('is-success');
    msg.classList.add('error-message');
  }
});
$('#coupon-code').addEventListener('input', () => { appliedCoupon = null; $('#coupon-message').textContent = ''; renderCart(); });
// Aviso em vermelho com tudo o que o cliente esqueceu de preencher no pedido.
let checkoutAttempted = false;
function checkoutProblems() {
  const f = $('#checkout-form'), el = n => f.elements[n];
  const val = n => String(el(n)?.value || '').trim();
  const list = [];
  const add = (node, text) => list.push({ node, text });
  if (val('customerName').length < 2) add(el('customerName'), 'Seu nome');
  const digits = val('phone').replace(/\D/g, '');
  if (!digits) add(el('phone'), 'WhatsApp / telefone (com DDD)');
  else if (digits.length < 10) add(el('phone'), 'WhatsApp / telefone incompleto (digite o DDD e o número)');
  if (!isPickup()) {
    if (val('address').length < 6) add(el('address'), 'Endereço completo (rua, número e complemento)');
    if (!val('zoneId')) add(el('zoneId'), 'Bairro (para calcular o frete)');
  }
  if (!val('paymentMethod')) add(el('paymentMethod'), 'Forma de pagamento');
  if (val('paymentMethod') === 'Dinheiro') {
    if (!val('needsChange')) add(el('needsChange'), 'Se precisa de troco');
    else if (val('needsChange') === 'yes' && !val('changeFor')) add(el('changeFor'), 'Troco para quanto');
  }
  if ($('#order-time').value === 'scheduled' && scheduleDays.length) {
    if (!$('#schedule-day').value) add($('#schedule-day'), 'Dia do agendamento');
    if (!$('#schedule-time').value) add($('#schedule-time'), 'Horário do agendamento');
  }
  return list;
}
function showCheckoutProblems(scrollToBox) {
  const f = $('#checkout-form');
  let box = $('#checkout-missing');
  if (!box) {
    box = document.createElement('div');
    box.id = 'checkout-missing';
    box.className = 'checkout-missing hidden';
    box.setAttribute('role', 'alert');
    $('#submit-order').before(box);
  }
  f.querySelectorAll('.field-invalid').forEach(n => n.classList.remove('field-invalid'));
  const problems = checkoutProblems();
  problems.forEach(p => p.node?.classList.add('field-invalid'));
  const sig = problems.map(p => p.text).join('|');
  if (sig !== box.dataset.sig) {
    box.dataset.sig = sig;
    box.replaceChildren();
    if (problems.length) {
      const title = document.createElement('strong');
      title.textContent = problems.length === 1 ? 'Falta 1 informação para fazer o pedido:' : `Faltam ${problems.length} informações para fazer o pedido:`;
      const ul = document.createElement('ul');
      problems.forEach(p => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button';
        b.textContent = p.text;
        b.addEventListener('click', () => {
          scrollRespectingMotion(p.node, { behavior: 'smooth', block: 'center' });
          p.node.focus({ preventScroll: true });
        });
        li.append(b);
        ul.append(li);
      });
      box.append(title, ul);
    }
  }
  box.classList.toggle('hidden', !problems.length);
  if (scrollToBox && problems.length) scrollRespectingMotion(box, { behavior: 'smooth', block: 'center' });
  return problems;
}
// Depois da primeira tentativa, a lista acompanha o cliente: some item por item conforme ele preenche.
$('#checkout-form').addEventListener('input', () => { if (checkoutAttempted) showCheckoutProblems(false); });
$('#checkout-form').addEventListener('change', () => { if (checkoutAttempted) showCheckoutProblems(false); });
$('#checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('#checkout-message');
  msg.textContent = '';
  document.getElementById('order-whatsapp-box')?.remove();
  if (!cart.length) {
    msg.textContent = 'Adicione pelo menos um açaí ao pedido.';
    return;
  }
  checkoutAttempted = true;
  if (showCheckoutProblems(true).length) return;
  if ($('#order-time').value === 'scheduled' && !$('#scheduled-for').value) {
    msg.textContent = scheduleDays.length ? 'Escolha o dia e o horário do agendamento.' : 'Não há horários disponíveis para agendar agora. Escolha outra opção ou fale com a loja pelo WhatsApp.';
    return;
  }
  const fd = new FormData(form);
  const payload = { customerName: fd.get('customerName'), phone: fd.get('phone'), fulfillment: fd.get('fulfillment') === 'pickup' ? 'pickup' : 'delivery', address: fd.get('address'), zoneId: Number(fd.get('zoneId')), notes: fd.get('notes'), paymentMethod: fd.get('paymentMethod'), needsChange: fd.get('needsChange') || 'no', changeFor: fd.get('changeFor') || '', spoonQuantity: spoonCount(), scheduledFor: fd.get('orderTime') === 'scheduled' ? fd.get('scheduledFor') : null, couponCode: appliedCoupon?.code || '', items: cart.map(i => ({ sizeId: i.sizeId, quantity: i.quantity, optionIds: i.optionIds, optionLayers: i.optionLayers || {}, ...(i.halfIceCreamId ? { halfIceCreamId: i.halfIceCreamId } : {}) })) };
  const button = $('#submit-order');
  button.disabled = true;
  button.textContent = 'Registrando pedido…';
  try {
    const order = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
    const lines = order.items.map(i => `• ${i.quantity}x ${i.product} (${i.size})${i.halfIceCream ? '\n  🍦 ' + halfLabel(i.halfIceCream) : ''}\n  ${i.options.map(o => o.name + layersText(o.layers)).join(', ') || 'Sem adicionais'} — ${brl(i.lineTotalCents)}`).join('\n');
    const pickupOrder = order.fulfillment === 'pickup';
    const scheduled = order.scheduledFor ? `\nAgendamento: ${new Date(order.scheduledFor).toLocaleString('pt-BR')}` : (order.fulfillment === 'pickup' ? '\nRetirada: agora' : '\nEntrega: agora');
    const text = `Olá! Quero confirmar o pedido ${order.orderCode} no Açaí da Roça.\n\n${lines}\n\nSubtotal: ${brl(order.subtotalCents)}${order.comboDiscountCents ? `\nDesconto combo: -${brl(order.comboDiscountCents)}` : ''}${order.discountCents ? `\nCupom ${order.couponCode}: -${brl(order.discountCents)}` : ''}${pickupOrder ? '\nRETIRADA NA LOJA (sem taxa de entrega)' : `\nEntrega (${order.neighborhood}): ${order.freeDelivery ? 'GRÁTIS 🎉' : brl(order.deliveryFeeCents)}`}\nColher: ${spoonText(order.spoonQuantity, order.spoonCents)}\nTOTAL: ${brl(order.totalCents)}\nPrevisão estimada: ${order.estimatedMinutesMin} a ${order.estimatedMinutesMax} minutos\n\nNome: ${order.customerName}\nTelefone: ${order.phone}${pickupOrder ? '' : `\nEndereço: ${order.address}`}
Forma de pagamento: ${order.paymentMethod}${order.pix ? '\nValor do Pix: ' + brl(order.pix.amountCents) : ''}${order.changeFor ? `\nTroco para: R$ ${order.changeFor}` : ''}${scheduled}${order.notes ? '\nObservações: ' + order.notes : ''}\n\nO pedido foi registrado pelo site.${order.pix ? '\nO código Pix está disponível no site, na tela do pedido. Após pagar, envie o comprovante nesta conversa.\n' + PIX_NOTICE : ''}`;
    msg.textContent = `Pedido ${order.orderCode} registrado! Agora envie no WhatsApp para a loja confirmar (botão abaixo). Guarde esse código para acompanhar, editar ou cancelar seu pedido na seção “Acompanhe seu pedido”.`;
    $('#tracking-form [name=code]').value = order.orderCode;
    $('#tracking-form [name=phone]').value = order.phone;
    if ($('#save-customer-details').checked) {
      localStorage.setItem('acaiCustomerDetails', JSON.stringify({ customerName: order.customerName, phone: order.phone, address: String(fd.get('address') || '').trim(), zoneId: fd.get('zoneId') }));
    }
    else {
      localStorage.removeItem('acaiCustomerDetails');
    }
    if (localStorage.getItem('acaiCustomerToken'))
      loadCustomerAccount();
    cart = [];
    resetBuilder();
    appliedCoupon = null;
    $('#coupon-code').value = '';
    $('#coupon-message').textContent = '';
    renderCart();
    const waUrl = `https://wa.me/${String(order.whatsappNumber || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    rememberPendingWhatsapp(order, waUrl);
    showWhatsappStep(msg, order, waUrl);
    // Se o navegador deixou abrir o WhatsApp sozinho, avisa a loja que o cliente chegou lá.
    if (window.open(waUrl, '_blank', 'noopener,noreferrer')) markWhatsappOpened(order.orderCode, order.phone);
    checkoutAttempted = false;
    form.reset();
    restoreSavedDetails();
    syncFulfillment();
    $('#schedule-label').classList.add('hidden');
    syncOrderTimeOptions();
  }
  catch (err) {
    msg.textContent = err.message;
    refreshTruffleStock();
  }
  finally {
    button.disabled = false;
    button.textContent = 'Fazer pedido';
  }
});
// "Agora" só vale com a loja aberta para pedidos imediatos; fechada, o cliente cai direto em "Agendar".
function syncOrderTimeOptions() {
  const sel = $('#order-time'), now = sel?.querySelector('option[value="now"]');
  if (!sel || !now || !store) return;
  const closed = !store.openNow;
  now.disabled = closed;
  now.textContent = closed ? 'Agora (loja fechada)' : 'Agora';
  if (closed && sel.value !== 'scheduled') {
    sel.value = 'scheduled';
    sel.dispatchEvent(new Event('change'));
  }
}
// Avisa a loja que o cliente tocou no WhatsApp (o painel mostra isso no pedido). Nunca atrapalha o cliente se falhar.
function markWhatsappOpened(code, phone) {
  try {
    fetch(`/api/orders/${encodeURIComponent(code)}/whatsapp-opened`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) }).catch(() => {});
  } catch { /* segue sem avisar */ }
}
// Lembrete fixo: se o cliente registrou o pedido e saiu sem enviar a mensagem, o aviso volta quando ele reabrir o site.
const PENDING_WA_KEY = 'acaiPendingWhatsapp', PENDING_WA_MAX_MS = 6 * 60 * 60 * 1000;
function rememberPendingWhatsapp(order, url) {
  try { localStorage.setItem(PENDING_WA_KEY, JSON.stringify({ code: order.orderCode, phone: order.phone, url, at: Date.now() })); } catch { /* sem armazenamento */ }
}
function clearPendingWhatsapp() {
  try { localStorage.removeItem(PENDING_WA_KEY); } catch { /* sem armazenamento */ }
  document.getElementById('wa-pending-banner')?.remove();
}
function showPendingWhatsappBanner() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(PENDING_WA_KEY) || 'null'); } catch { data = null; }
  if (!data || !data.url || Date.now() - Number(data.at || 0) > PENDING_WA_MAX_MS) { clearPendingWhatsapp(); return; }
  if (document.getElementById('wa-pending-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'wa-pending-banner';
  bar.className = 'wa-pending-banner';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = `Seu pedido ${data.code} foi registrado. Falta enviar a mensagem no WhatsApp para a loja confirmar.`;
  const send = document.createElement('a');
  send.className = 'button button-green button-small';
  send.href = data.url;
  send.target = '_blank';
  send.rel = 'noopener noreferrer';
  send.textContent = 'Enviar no WhatsApp';
  send.addEventListener('click', () => markWhatsappOpened(data.code, data.phone));
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'button button-outline button-small';
  done.textContent = 'Já enviei';
  done.addEventListener('click', clearPendingWhatsapp);
  bar.append(text, send, done);
  document.body.prepend(bar);
}
// O navegador costuma bloquear janelas abertas depois de uma espera (iPhone principalmente). Por isso o botão fica na tela
// até o cliente enviar a mensagem: o pedido só é confirmado pela loja depois disso.
function showWhatsappStep(anchor, order, url) {
  document.getElementById('order-whatsapp-box')?.remove();
  const box = document.createElement('div');
  box.id = 'order-whatsapp-box';
  box.className = 'order-whatsapp-box';
  box.setAttribute('role', 'status');
  const t = document.createElement('strong');
  t.textContent = `Falta só um passo: envie o pedido ${order.orderCode} no WhatsApp`;
  const p = document.createElement('p');
  p.textContent = order.pix ? 'O código Pix copia e cola está nesta página, logo abaixo. Use o botão para copiar, pague pelo app do seu banco e envie o comprovante nesta conversa do WhatsApp. ' + PIX_NOTICE : 'O pedido só é confirmado pela loja depois que você enviar a mensagem. Se o WhatsApp não abriu sozinho, toque no botão abaixo.';
  const a = document.createElement('a');
  a.className = 'button button-primary button-full';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Enviar pedido no WhatsApp';
  a.addEventListener('click', () => markWhatsappOpened(order.orderCode, order.phone));
  box.append(t, p);
  if (order.pix) box.append(pixBlock(order.pix));
  box.append(a);
  anchor.insertAdjacentElement('afterend', box);
  scrollRespectingMotion(box, { behavior: 'smooth', block: 'center' });
}
// Bloco "Pague com Pix": valor, código copia e cola e botão de copiar.
function pixBlock(pix) {
  const wrap = document.createElement('div');
  wrap.className = 'pix-block';
  const h = document.createElement('strong');
  h.textContent = `Pague com Pix: ${brl(pix.amountCents)}`;
  const hint = document.createElement('small');
  hint.textContent = `Recebedor: ${pix.name} · Chave: ${pix.key}`;
  const code = document.createElement('textarea');
  code.readOnly = true;
  code.rows = 3;
  code.value = pix.payload;
  code.setAttribute('aria-label', 'Código Pix copia e cola');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'button button-outline button-full';
  btn.textContent = 'Copiar código Pix';
  btn.addEventListener('click', async () => {
    const payload = String(pix.payload || '').trim();
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(payload);
        copied = true;
      }
    } catch { /* tenta alternativa compatível */ }
    if (!copied) {
      code.focus();
      code.select();
      code.setSelectionRange(0, code.value.length);
      try { copied = document.execCommand('copy'); } catch { copied = false; }
    }
    btn.textContent = copied ? '✓ Código copiado! Cole no app do banco' : 'Selecione e copie o código acima';
    setTimeout(() => { btn.textContent = 'Copiar código Pix'; }, 4000);
  });
  wrap.append(h, hint, code, btn);
  return wrap;
}

// "Quero esse" na galeria só leva ao cardápio (link #cardapio). Nada é anotado no pedido:
// o sabor só entra quando a cliente escolhe o trufado no cardápio.
