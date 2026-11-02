async function loadCoupons() {
  const rows = await api('/coupons');
  $('#coupons-list').innerHTML = rows.length ? rows.map(c => `<article class="coupon-row"><div><strong>${esc(c.code)}</strong><small>${c.discount_type === 'percent' ? `${c.discount_value}% de desconto` : `${brl(c.discount_value)} de desconto`} · mínimo ${brl(c.min_subtotal_cents)}</small></div><label class="mini-check"><input type="checkbox" data-coupon-active="${c.id}" ${c.active ? 'checked' : ''}> Ativo</label><button class="button button-small button-danger" data-delete-coupon="${c.id}">Excluir</button></article>`).join('') : '<p class="muted">Nenhum cupom cadastrado.</p>';
  document.querySelectorAll('[data-coupon-active]').forEach(el => el.addEventListener('change', async () => {
    try {
      await api('/coupons/' + el.dataset.couponActive, { method: 'PATCH', body: JSON.stringify({ active: el.checked }) });
      say('Status do cupom atualizado.');
    }
    catch (e) {
      say(e.message);
      el.checked = !el.checked;
    }
  }));
  document.querySelectorAll('[data-delete-coupon]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Excluir este cupom?'))
      return;
    try {
      await api('/coupons/' + b.dataset.deleteCoupon, { method: 'DELETE' });
      say('Cupom excluído.');
      loadCoupons();
    }
    catch (e) {
      say(e.message);
    }
  }));
}
$('#coupon-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, fd = new FormData(f), type = fd.get('discountType'), raw = Number(fd.get('discountValue')), minimum = Math.round(Number(fd.get('minSubtotal') || 0) * 100);
  try {
    await api('/coupons', { method: 'POST', body: JSON.stringify({ code: fd.get('code'), discountType: type, discountValue: type === 'fixed' ? Math.round(raw * 100) : Math.round(raw), minSubtotalCents: minimum }) });
    f.reset();
    f.elements.minSubtotal.value = '0';
    say('Cupom criado.');
    loadCoupons();
  }
  catch (err) {
    say(err.message);
  }
});
