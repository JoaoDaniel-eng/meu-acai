async function loadSettings() {
  const s = await api('/settings'), f = $('#settings-form');
  for (const key of ['store_name', 'whatsapp_number', 'opening_time', 'closing_time', 'minimum_schedule_minutes', 'max_free_toppings', 'combo_min_items', 'combo_discount_percent', 'free_delivery_min', 'estimated_minutes_min', 'estimated_minutes_max', 'pix_key', 'pix_name', 'pix_city'])
    f.elements[key].value = s[key] || '';
  f.elements.manual_closed.checked = s.manual_closed === 'true';
  const days = (s.opening_days || '2,3,4,5,6,0').split(',');
  f.querySelectorAll('[type=checkbox][value]').forEach(c => c.checked = days.includes(c.value));
  await loadPauseState();
}
$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, fd = new FormData(f), openingDays = [...f.querySelectorAll('[type=checkbox][value]:checked')].map(c => c.value);
  const body = {};
  for (const key of ['store_name', 'whatsapp_number', 'opening_time', 'closing_time', 'minimum_schedule_minutes', 'max_free_toppings', 'combo_min_items', 'combo_discount_percent', 'free_delivery_min', 'estimated_minutes_min', 'estimated_minutes_max', 'pix_key', 'pix_name', 'pix_city'])
    body[key] = fd.get(key);
  body.manual_closed = f.elements.manual_closed.checked ? 'true' : 'false';
  body.opening_days = openingDays.join(',');
  try {
    const note = text => { const el = $('#settings-message'); if (el) el.textContent = text; say(text); };
    note('Salvando…');
    const saved = await api('/settings', { method: 'PATCH', body: JSON.stringify(body) });
    // Servidor antigo (pasta src não atualizada) ignora o campo sem erro: avisa em vez de parecer que salvou.
    if (saved && !('free_delivery_min' in saved)) {
      note('Atenção: o servidor ainda está na versão antiga e não salvou o frete grátis. Publique também a pasta "src" e reinicie o servidor.');
      return;
    }
    note(`Configurações salvas. Frete grátis a partir de: ${Number(saved.free_delivery_min) > 0 ? 'R$ ' + String(saved.free_delivery_min).replace('.', ',') : 'desligado'}.`);
    await loadStats();
    await loadPauseState();
  }
  catch (err) {
    const el = $('#settings-message');
    if (el) el.textContent = err.message;
    say(err.message);
  }
});
