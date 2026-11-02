const statusLabel = { new: 'Novo', preparing: 'Preparando', out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado' };
// Pedido "Novo" há mais de 10 min: o cliente pode não ter enviado a mensagem no WhatsApp, ou ninguém atendeu ainda.
const LATE_NEW_MIN = 10;
const orderAgeMin = o => Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
const isLateNew = o => o.status === 'new' && !(o.scheduled_for && new Date(o.scheduled_for).getTime() > Date.now()) && orderAgeMin(o) >= LATE_NEW_MIN;
const waLink = phone => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10)
    return '';
  if (d.length <= 11)
    d = '55' + d;
  return 'https://wa.me/' + d;
};
const lateBadge = o => {
  if (!isLateNew(o))
    return '';
  const link = waLink(o.customer_phone);
  return `<small class="order-late-badge">⏰ Novo há ${orderAgeMin(o)} min${link ? ` · <a href="${link}" target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>` : ''}</small>`;
};
async function loadOrders(silent = false) {
  const rows = await api('/orders?status=' + encodeURIComponent($('#order-filter').value));
  const host = $('#orders-table');
  const lateCount = rows.filter(isLateNew).length;
  const lateBanner = lateCount ? `<p class="order-late-banner" role="alert">⏰ ${lateCount} pedido${lateCount > 1 ? 's' : ''} novo${lateCount > 1 ? 's' : ''} sem atendimento há ${LATE_NEW_MIN} min ou mais. Confira o WhatsApp ou chame o cliente.</p>` : '';
  host.innerHTML = rows.length ? lateBanner + `<table><thead><tr><th>Pedido</th><th>Cliente / entrega</th><th>Itens</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.map(o => `<tr${isLateNew(o) ? ' class="order-late-row"' : ''}><td><strong>${esc(o.order_code)}</strong><small>${new Date(o.created_at).toLocaleString('pt-BR')}</small>${o.scheduled_for ? `<small>Agendado: ${new Date(o.scheduled_for).toLocaleString('pt-BR')}</small>` : ''}</td><td>${esc(o.customer_name)}<small>${esc(o.customer_phone)}</small><small>${esc(o.address)} — ${esc(o.neighborhood)}</small>${o.notes ? `<small>Obs.: ${esc(o.notes)}</small>` : ''}</td><td>${(o.items || []).map(i => `<small>${i.quantity}× ${esc(i.size)} — ${(i.options || []).map(x => esc(x.name)).join(', ') || 'sem adicionais'}</small>`).join('')}</td><td>${esc(o.payment_method || 'A combinar')}${o.change_for ? `<small>Troco para R$ ${esc(o.change_for)}</small>` : ''}${o.coupon_code ? `<small>Cupom ${esc(o.coupon_code)} · -${brl(o.discount_cents)}</small>` : ''}</td><td><strong>${brl(o.total_cents)}</strong><small>Itens ${brl(o.subtotal_cents)}${Number(o.combo_discount_cents) > 0 ? ` − combo ${brl(o.combo_discount_cents)}` : ''}${Number(o.discount_cents) > 0 ? ` − cupom ${brl(o.discount_cents)}` : ''} + entrega ${brl(o.delivery_fee_cents)}</small></td><td><span class="status status-${o.status}">${statusLabel[o.status]}</span>${lateBadge(o)}</td><td><select data-status-id="${o.id}" aria-label="Alterar status de ${esc(o.order_code)}">${Object.entries(statusLabel).map(([v, l]) => `<option value="${v}" ${v === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="button button-small button-danger" type="button" data-delete-order="${o.id}">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum pedido encontrado.</p>';
  host.querySelectorAll('[data-status-id]').forEach(el => el.addEventListener('change', async () => {
    try {
      await api(`/orders/${el.dataset.statusId}/status`, { method: 'PATCH', body: JSON.stringify({ status: el.value }) });
      say('Status atualizado.');
      await loadStats();
      await loadOrders();
    }
    catch (e) {
      say(e.message);
    }
  }));
  host.querySelectorAll('[data-delete-order]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Excluir permanentemente este pedido? Essa ação não pode ser desfeita. Faça um backup antes, se necessário.'))
      return;
    try {
      await api('/orders/' + b.dataset.deleteOrder, { method: 'DELETE' });
      say('Pedido excluído.');
      await loadOrders();
      await loadStats();
    }
    catch (e) {
      say(e.message);
    }
  }));
  if (!silent)
    host.scrollTop = 0;
}
$('#order-filter').addEventListener('change', () => loadOrders());
