// Acompanhamento, edição e cancelamento do pedido.
const statusNames = { new: 'Recebido', preparing: 'Em preparo', out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado' };
let trackedOrder = null;
// Mesmo texto no site, na mensagem do pedido e na mensagem de edição.
const PIX_NOTICE = '⚠️ Pedido só será preparado após o envio do comprovante do Pix.';
function whatsapp(text, number) {
  const n = String(number || '').replace(/\D/g, '');
  if (n.length < 10) {
    throw new Error('O WhatsApp da loja não está configurado corretamente. Entre em contato com a loja por outro canal.');
  }
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}
function orderSummary(o, heading) { const lines = (o.items || []).map(i => `• ${i.quantity}x ${i.product} (${i.size}) — ${brl(i.lineTotalCents)}\n  ${(i.options || []).map(x => x.name).join(', ') || 'Sem adicionais'}`).join('\n'); return `${heading} ${o.orderCode} — Açaí da Roça\n\n${lines}\n\nSubtotal: ${brl(o.subtotalCents)}${o.comboDiscountCents ? `\nDesconto combo: -${brl(o.comboDiscountCents)}` : ''}${o.discountCents ? `\nCupom ${o.couponCode}: -${brl(o.discountCents)}` : ''}\nEntrega (${o.neighborhood}): ${brl(o.deliveryFeeCents)}\nTOTAL: ${brl(o.totalCents)}\n\nNome: ${o.customerName}\nTelefone: ${o.phone}\nEndereço: ${o.address}\nPagamento: ${o.paymentMethod || 'A combinar'}${(o.pix || o.paymentMethod === 'Pix') ? '\n' + PIX_NOTICE : ''}${o.changeFor ? `\nTroco para: R$ ${o.changeFor}` : ''}\nObservações: ${o.notes || 'Nenhuma'}\n\n${o.scheduledFor ? 'Agendamento: ' + new Date(o.scheduledFor).toLocaleString('pt-BR') : 'Entrega assim que possível'}\nPrevisão estimada: ${o.estimatedMinutesMin || 35} a ${o.estimatedMinutesMax || 55} minutos`; }
// Depois que a loja começa o preparo o pedido trava no site: mudanças e cancelamento passam a ser combinados pelo WhatsApp.
function lockedOrderNote(o) {
  if (o.canEdit || ['delivered', 'cancelled'].includes(o.status))
    return '';
  const n = String(store?.whatsappNumber || '').replace(/\D/g, '');
  const text = `Olá! Sobre o pedido ${o.orderCode} no Açaí da Roça: preciso combinar uma alteração.`;
  return `<div class="order-locked-note"><p><strong>A loja já começou a preparar seu pedido.</strong> Para alterar ou cancelar agora, fale direto com a loja pelo WhatsApp.</p>${n.length >= 10 ? `<a class="button button-green" href="https://wa.me/${n}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Falar com a loja no WhatsApp</a>` : ''}</div>`;
}
function renderTracking(o) {
  trackedOrder = o;
  trackDirty = false;
  const result = $('#tracking-result');
  const rawSizes = (menu?.products?.flatMap(p => p.sizes) || []).slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || Number(a.id) - Number(b.id));
  const seenSizeNames = new Set();
  const allSizes = rawSizes.filter(sz => {
    const key = String(sz.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
    if (!key || seenSizeNames.has(key))
      return false;
    seenSizeNames.add(key);
    return true;
  });
  const items = o.items.map((i, index) => {
    const sizeOptions = allSizes.map(sz => `<option value="${sz.id}" ${Number(sz.id) === Number(i.sizeId) ? 'selected' : ''}>${esc(sz.name)} — ${brl(sz.price)}</option>`).join('');
    const optionGroups = [['topping', 'Acompanhamentos'], ['syrup', 'Calda'], ['extra', 'Adicionais'], ['mousse', 'Mousses']].map(([category, label]) => {
      const opts = (menu?.options || []).filter(x => x.category === category);
      if (!opts.length)
        return '';
      return `<fieldset class="edit-option-group"><legend>${label}</legend><div class="edit-option-list">${opts.map(opt => `<label><input type="checkbox" data-edit-option="${opt.id}" data-edit-category="${category}" data-edit-index="${index}" ${i.options.some(x => Number(x.id) === Number(opt.id)) ? 'checked' : ''}> ${esc(opt.name)}${Number(opt.price) > 0 ? ` (+ ${brl(opt.price)})` : ''}</label>`).join('')}</div></fieldset>`;
    }).join('');
    const currentOptions = i.options.map(x => esc(x.name)).join(', ') || 'Sem acompanhamentos';
    return `<div class="tracking-item tracking-item-edit"><div class="tracking-item-heading"><strong>Item ${index + 1}</strong>${o.canEdit ? `<label class="tracking-qty">Quantidade<input type="number" min="0" max="20" value="${i.quantity}" data-track-qty="${index}"></label>` : `<span>Quantidade: ${i.quantity}</span>`}</div>${o.canEdit ? `<label class="edit-size-label">Tamanho do açaí<select data-edit-size="${index}">${sizeOptions}</select></label>${optionGroups}<p class="muted">Quantidade 0 remove este item do pedido.</p>` : `<p><strong>${esc(i.size)}</strong></p><p>${currentOptions}</p>`}</div>`;
  }).join('');
  result.innerHTML = `<div class="tracking-card"><div class="tracking-top"><div><small>Pedido</small><h3>${esc(o.orderCode)}</h3></div><span class="status status-${o.status}">${statusNames[o.status] || o.status}</span></div><p><strong>Cliente:</strong> ${esc(o.customerName)}</p><p><strong>Entrega:</strong> ${esc(o.address)} — ${esc(o.neighborhood)}</p><p><strong>Pagamento:</strong> ${esc(o.paymentMethod || 'A combinar')}${o.changeFor ? ` — Troco para R$ ${esc(o.changeFor)}` : ''}</p><p class="estimate-note"><strong>Previsão estimada:</strong> ${o.estimatedMinutesMin || 35} a ${o.estimatedMinutesMax || 55} minutos após confirmação.</p><p class="loyalty-note">💜 Programa de fidelidade: ${o.loyaltyBalance || 0} ponto(s) acumulado(s) neste telefone.${o.earnedPoints ? ` Este pedido rendeu ${o.earnedPoints} ponto(s)!` : ''} A cada R$ 1 em pedidos entregues, você ganha 1 ponto.</p><div class="tracking-progress"><span class="${o.status !== 'cancelled' ? 'done' : ''}">Recebido</span><span class="${['preparing', 'out_for_delivery', 'delivered'].includes(o.status) ? 'done' : ''}">Em preparo</span><span class="${['out_for_delivery', 'delivered'].includes(o.status) ? 'done' : ''}">Saiu para entrega</span><span class="${o.status === 'delivered' ? 'done' : ''}">Entregue</span></div>${lockedOrderNote(o)}<h4>Itens do pedido</h4>${o.canEdit ? `<p class="muted">Altere tamanho, calda, acompanhamentos, adicionais, mousses e quantidade. Quantidade 0 remove o item.</p>` : ''}<div class="tracking-items">${items}</div><div class="tracking-total"><span>Total${o.comboDiscountCents ? ` · combo (-${brl(o.comboDiscountCents)})` : ''}${o.discountCents ? ` · cupom ${esc(o.couponCode)} (-${brl(o.discountCents)})` : ''}</span><strong>${brl(o.totalCents)}</strong></div><button class="button button-outline" id="repeat-tracked-order" type="button">Repetir este pedido</button><p id="repeat-order-message" class="form-message" role="status"></p>${o.canEdit ? `<form id="customer-edit-form" class="customer-edit"><h4>Editar dados da entrega</h4><label>Nome<input name="customerName" required value="${esc(o.customerName)}"></label><label>Endereço<input name="address" required value="${esc(o.address)}"></label><label>Bairro<select name="zoneId"><option value="">Manter bairro atual (${esc(o.neighborhood)})</option>${(menu?.zones || []).map(z => `<option value="${z.id}" ${z.name === o.neighborhood ? 'selected' : ''}>${esc(z.name)} — ${brl(z.fee)}</option>`).join('')}</select></label><label>Observações<textarea name="notes" rows="2">${esc(o.notes || '')}</textarea></label><button class="button button-primary" type="submit">Salvar alterações</button><p class="form-message error-message" id="edit-order-message" role="alert"></p></form><button class="button button-danger" id="cancel-customer-order" type="button">Cancelar pedido</button>` : ''}<p class="form-message error-message" id="tracking-action-message" role="alert"></p></div>`;
  result.classList.remove('hidden');
}
$('#tracking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget), msg = $('#tracking-message');
  msg.textContent = 'Consultando pedido…';
  $('#tracking-result').classList.add('hidden');
  try {
    const o = await api(`/orders/track?code=${encodeURIComponent(fd.get('code'))}&phone=${encodeURIComponent(fd.get('phone'))}`);
    o.lookupPhone = fd.get('phone');
    renderTracking(o);
    msg.textContent = '';
    startLiveTracking();
  }
  catch (err) {
    msg.textContent = err.message;
  }
});
document.addEventListener('change', e => {
  if (!e.target.matches('[data-edit-option]'))
    return;
  const checkbox = e.target;
  if (checkbox.dataset.editCategory !== 'topping' || !checkbox.checked)
    return;
  const index = checkbox.dataset.editIndex;
  const checked = document.querySelectorAll(`[data-edit-index="${index}"][data-edit-category="topping"]:checked`).length;
  const limit = Number(store?.maxFreeToppings || 5);
  if (checked > limit) {
    checkbox.checked = false;
    const msg = $('#edit-order-message') || $('#tracking-action-message');
    if (msg) {
      msg.textContent = `Você pode escolher no máximo ${limit} acompanhamentos por açaí.`;
      msg.classList.add('error-message');
    }
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'customer-edit-form')
    return;
  e.preventDefault();
  if (!trackedOrder)
    return;
  const fd = new FormData(e.target), msg = $('#edit-order-message');
  msg.textContent = 'Salvando alterações…';
  const quantities = [...document.querySelectorAll('[data-track-qty]')].map(el => ({ index: Number(el.dataset.trackQty), quantity: Number(el.value), sizeId: Number(document.querySelector(`[data-edit-size="${el.dataset.trackQty}"]`)?.value), optionIds: [...document.querySelectorAll(`[data-edit-index="${el.dataset.trackQty}"][data-edit-option]:checked`)].map(x => Number(x.dataset.editOption)) })).filter(x => x.quantity > 0);
  if (!quantities.length) {
    msg.textContent = 'O pedido precisa ter pelo menos um item.';
    return;
  }
  try {
    const updated = await api(`/orders/${trackedOrder.orderCode}/customer`, { method: 'PATCH', body: JSON.stringify({ phone: trackedOrder.lookupPhone, customerName: fd.get('customerName'), address: fd.get('address'), zoneId: fd.get('zoneId') ? Number(fd.get('zoneId')) : undefined, notes: fd.get('notes'), items: quantities }) });
    updated.lookupPhone = trackedOrder.lookupPhone;
    renderTracking(updated);
    if (updated.pix) {
      const card = $('#tracking-result .tracking-card');
      const note = document.createElement('p');
      note.className = 'estimate-note';
      note.textContent = 'O valor do pedido mudou: use o Pix abaixo (o código anterior ficou com o valor antigo).';
      card.append(note, pixBlock(updated.pix));
    }
    whatsapp(orderSummary(updated, 'Olá! Quero confirmar a EDIÇÃO do pedido'), ' ' + updated.whatsappNumber);
    $('#tracking-action-message').textContent = 'Alteração registrada! Envie a mensagem no WhatsApp para avisar a loja.';
  }
  catch (err) {
    msg.textContent = err.message;
  }
});
document.addEventListener('click', async (e) => {
  if (e.target.id === 'repeat-tracked-order' && trackedOrder) {
    const message = $('#repeat-order-message');
    const repeated = [];
    for (const item of trackedOrder.items || []) {
      const size = menu?.products?.flatMap(p => p.sizes || []).find(s => Number(s.id) === Number(item.sizeId));
      if (!size)
        continue;
      const options = (item.options || []).map(old => menu.options.find(o => Number(o.id) === Number(old.id) && o.active !== false)).filter(Boolean);
      const unit = Number(size.price) + options.reduce((sum, o) => sum + Number(o.price || 0), 0);
      repeated.push({ sizeId: size.id, size: size.name, quantity: item.quantity, optionIds: options.map(o => o.id), options, unitPriceCents: unit, lineTotalCents: unit * item.quantity });
    }
    if (!repeated.length) {
      message.textContent = 'Os itens deste pedido não estão mais disponíveis no cardápio.';
      return;
    }
    cart.push(...repeated);
    appliedCoupon = null;
    $('#coupon-code').value = '';
    $('#coupon-message').textContent = '';
    renderCart();
    message.textContent = repeated.length < (trackedOrder.items || []).length ? 'Alguns itens não estão mais disponíveis e não foram adicionados.' : 'Itens adicionados novamente ao carrinho!';
    $('#pedido').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (e.target.id !== 'cancel-customer-order' || !trackedOrder)
    return;
  if (!confirm('Tem certeza de que deseja cancelar este pedido?'))
    return;
  const msg = $('#tracking-action-message');
  msg.textContent = 'Cancelando pedido…';
  try {
    const r = await api(`/orders/${trackedOrder.orderCode}/cancel`, { method: 'POST', body: JSON.stringify({ phone: trackedOrder.lookupPhone }) });
    trackedOrder.status = 'cancelled';
    trackedOrder.canEdit = false;
    trackedOrder.canCancel = false;
    renderTracking(trackedOrder);
    whatsapp(`Olá! Solicito o CANCELAMENTO do pedido ${r.order_code} no Açaí da Roça. O pedido foi cancelado pelo site.`, r.whatsappNumber);
    $('#tracking-action-message').textContent = 'Pedido cancelado no site. Envie a mensagem no WhatsApp para avisar a loja.';
    loadCustomerOrdersIfSignedIn();
  }
  catch (err) {
    msg.textContent = err.message;
  }
});
