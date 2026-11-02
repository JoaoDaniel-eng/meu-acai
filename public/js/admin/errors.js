// Avisos do topo do painel e aba "Erros".
async function loadAlerts() {
  try {
    const a = await api('/alerts'), items = [];
    if (a.errors24h > 0)
      items.push(`<div class="alert-item alert-error">⚠️ ${a.errors24h} erro(s) registrado(s) nas últimas 24 h. <button type="button" class="button button-outline" data-go-errors>Ver erros</button></div>`);
    if (a.noOrders)
      items.push(`<div class="alert-item alert-warn">⏳ Loja aberta e sem pedidos há mais de ${a.noOrders.hours} h. Se isso não é normal, abra o site e faça um pedido de teste.</div>`);
    const bar = $('#alerts-bar');
    bar.innerHTML = items.join('');
    const go = bar.querySelector('[data-go-errors]');
    if (go)
      go.addEventListener('click', () => switchTab('errors'));
  }
  catch (e) {
    console.warn('Avisos:', e.message);
  }
}
async function loadErrors() {
  const rows = await api('/client-errors');
  $('#errors-content').innerHTML = rows.length ? `<table><thead><tr><th>Quando</th><th>Origem</th><th>Mensagem</th><th>Onde</th><th>Página</th><th>Versão</th><th>Aparelho</th></tr></thead><tbody>${rows.map(r => `<tr><td>${new Date(r.created_at).toLocaleString('pt-BR')}</td><td>${r.kind === 'servidor' ? 'Servidor' : 'Tela do cliente'}</td><td>${esc(r.message)}</td><td>${esc(r.source ? String(r.source).replace(location.origin, '') + (r.line ? ':' + r.line : '') : '—')}</td><td>${esc(r.page || '—')}</td><td>${esc(r.build || '—')}</td><td>${esc(String(r.user_agent || '—').slice(0, 70))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum erro registrado. 🎉</p>';
}
$('#errors-clear').addEventListener('click', async () => {
  if (!confirm('Apagar toda a lista de erros?'))
    return;
  try {
    await api('/client-errors', { method: 'DELETE' });
    await loadErrors();
    await loadAlerts();
    say('Lista de erros apagada.');
  }
  catch (e) {
    say(e.message);
  }
});
