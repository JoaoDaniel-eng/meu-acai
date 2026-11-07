// Aba "Caixa": abertura, lançamentos (entrada, retirada, despesa), fechamento com conferência e histórico.
const CASH_KIND = { suprimento: 'Entrada de dinheiro', sangria: 'Retirada (sangria)', despesa: 'Despesa paga do caixa' };
const CASH_METHODS = ['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito'];
let cashLastClosed = null;
// "10", "10,5" e "10.50" viram centavos; vazio ou inválido vira null.
function moneyToCents(text) {
  const t = String(text ?? '').trim().replace(/^R\$\s*/i, '').replace(/\./g, m => (/,/.test(text) ? '' : m)).replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t))
    return null;
  return Math.round(Number(t) * 100);
}
const cashWhen = d => (typeof fmtDateTime === 'function' ? fmtDateTime(d) : new Date(d).toLocaleString('pt-BR'));
const diffText = c => (Number(c) === 0 ? 'Caixa batendo ✓' : Number(c) > 0 ? `Sobrou ${brl(c)}` : `Faltou ${brl(-c)}`);
const diffClass = c => (Number(c) === 0 ? 'cash-ok' : Number(c) > 0 ? 'cash-over' : 'cash-short');
function cashMethodRows(summary) {
  return Object.entries(summary.byMethod || {}).filter(([m, v]) => CASH_METHODS.includes(m) || v.orders > 0)
    .map(([m, v]) => `<tr><td>${esc(m)}</td><td>${v.orders}</td><td>${brl(v.totalCents)}</td></tr>`).join('');
}
function cashSummaryCards(summary) {
  return `<div class="stats-grid cash-stats">
    <article class="stat-card"><span>Troco inicial</span><strong>${brl(summary.openingCents)}</strong></article>
    <article class="stat-card"><span>Vendas em dinheiro</span><strong>${brl(summary.cashSalesCents)}</strong></article>
    <article class="stat-card"><span>Entradas / retiradas / despesas</span><strong>+${brl(summary.suppliesCents)} / −${brl(summary.withdrawalsCents)} / −${brl(summary.expensesCents)}</strong></article>
    <article class="stat-card cash-expected"><span>Dinheiro que deve ter no caixa</span><strong>${brl(summary.expectedCashCents)}</strong></article>
  </div>
  <table class="cash-table"><thead><tr><th>Forma de pagamento</th><th>Pedidos</th><th>Total</th></tr></thead><tbody>${cashMethodRows(summary)}<tr class="cash-total-row"><td>Total vendido</td><td>${summary.totalOrders}</td><td>${brl(summary.totalSalesCents)}</td></tr></tbody></table>`;
}
function cashMovementsList(movements, canDelete) {
  if (!movements.length)
    return '<p class="muted">Nenhum lançamento ainda.</p>';
  return `<table class="cash-table"><thead><tr><th>Hora</th><th>Tipo</th><th>Motivo</th><th>Valor</th><th></th></tr></thead><tbody>${movements.map(m => `<tr><td>${esc(cashWhen(m.created_at))}</td><td>${esc(CASH_KIND[m.kind] || m.kind)}</td><td>${esc(m.reason)}</td><td>${m.kind === 'suprimento' ? '+' : '−'}${brl(m.amount_cents)}</td><td>${canDelete ? `<button type="button" class="button button-small button-danger" data-cash-del="${m.id}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
}
function cashReportCard(report, title) {
  const s = report.session, sum = report.summary;
  return `<div class="cash-card cash-report"><h3>${esc(title)}</h3>
    <p class="muted">Aberto em ${esc(cashWhen(s.opened_at))} por ${esc(s.opened_by)}${s.closed_at ? ` · Fechado em ${esc(cashWhen(s.closed_at))} por ${esc(s.closed_by)}` : ''}</p>
    ${cashSummaryCards(sum)}
    ${s.closed_at ? `<div class="cash-result ${diffClass(s.difference_cents)}"><span>Esperado ${brl(s.expected_cents)} · Contado ${brl(s.counted_cents)}</span><strong>${diffText(s.difference_cents)}</strong></div>${s.open_notes ? `<p class="muted">Obs. na abertura: ${esc(s.open_notes)}</p>` : ''}${s.close_notes ? `<p class="muted">Obs. no fechamento: ${esc(s.close_notes)}</p>` : ''}` : ''}
    <h4>Lançamentos</h4>${cashMovementsList(report.movements, false)}
    <button type="button" class="button button-outline" data-cash-print="${s.id}">🖨️ Imprimir relatório</button></div>`;
}
function cashOpenForm() {
  return `<div class="cash-card"><h3>🔒 Caixa fechado</h3><p class="muted">Conte o dinheiro que está na gaveta e informe como troco inicial para abrir o caixa.</p>
    <form id="cash-open-form" class="inline-form">
      <label>Troco inicial (R$)<input name="opening" inputmode="decimal" placeholder="Ex.: 100,00" required></label>
      <label>Observação (opcional)<input name="notes" maxlength="500" placeholder="Ex.: turno da tarde"></label>
      <label class="cash-check"><input type="checkbox" name="resume"> Reabrir os pedidos imediatos do site</label>
      <button class="button button-primary" type="submit">Abrir caixa</button>
    </form></div>`;
}
function cashOpenView(report) {
  const s = report.session;
  return `<div class="cash-card"><h3>🔓 Caixa aberto</h3><p class="muted">Desde ${esc(cashWhen(s.opened_at))} por ${esc(s.opened_by)}. Os valores abaixo contam os pedidos não cancelados desde a abertura.</p>
    ${cashSummaryCards(report.summary)}</div>
    <div class="cash-card"><h3>Lançar movimento</h3>
    <form id="cash-move-form" class="inline-form">
      <label>Tipo<select name="kind"><option value="sangria">Retirada (sangria)</option><option value="despesa">Despesa paga do caixa</option><option value="suprimento">Entrada de dinheiro</option></select></label>
      <label>Valor (R$)<input name="amount" inputmode="decimal" placeholder="Ex.: 20,00" required></label>
      <label>Motivo<input name="reason" required minlength="3" maxlength="200" placeholder="Ex.: compra de gelo"></label>
      <button class="button button-primary" type="submit">Lançar</button>
    </form>${cashMovementsList(report.movements, true)}</div>
    <div class="cash-card"><h3>Fechar caixa</h3><p class="muted">Conte todo o dinheiro da gaveta e informe o valor. O sistema compara com o esperado (<strong>${brl(report.summary.expectedCashCents)}</strong>).</p>
    <form id="cash-close-form" class="inline-form">
      <label>Dinheiro contado (R$)<input name="counted" inputmode="decimal" placeholder="Ex.: 250,00" required></label>
      <label>Observação (opcional)<input name="notes" maxlength="500" placeholder="Ex.: faltou troco"></label>
      <label class="cash-check"><input type="checkbox" name="pause"> Pausar os pedidos imediatos do site</label>
      <button class="button button-danger" type="submit">Fechar caixa</button>
    </form></div>`;
}
async function loadCash() {
  const [current, history] = await Promise.all([api('/cash/current'), api('/cash/history')]);
  const root = $('#cash-root');
  root.innerHTML = (cashLastClosed && !current.session ? cashReportCard(cashLastClosed, 'Caixa fechado agora') : '') + (current.session ? cashOpenView(current) : cashOpenForm());
  $('#cash-history').innerHTML = history.length
    ? `<table class="cash-table"><thead><tr><th>Aberto</th><th>Fechado</th><th>Responsável</th><th>Esperado</th><th>Contado</th><th>Resultado</th><th></th></tr></thead><tbody>${history.map(h => `<tr><td>${esc(cashWhen(h.opened_at))}</td><td>${esc(cashWhen(h.closed_at))}</td><td>${esc(h.closed_by)}</td><td>${brl(h.expected_cents)}</td><td>${brl(h.counted_cents)}</td><td class="${diffClass(h.difference_cents)}">${esc(diffText(h.difference_cents))}</td><td><button type="button" class="button button-small button-outline" data-cash-view="${h.id}">Ver</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nenhum caixa fechado ainda.</p>';
}
function printCashReport(report) {
  const s = report.session, sum = report.summary, line = (a, b) => `<div class="r-row"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  const methods = Object.entries(sum.byMethod || {}).filter(([m, v]) => CASH_METHODS.includes(m) || v.orders > 0).map(([m, v]) => line(`${m} (${v.orders})`, brl(v.totalCents))).join('');
  const moves = report.movements.map(m => `<div class="r-block">${line(CASH_KIND[m.kind] || m.kind, (m.kind === 'suprimento' ? '+' : '-') + brl(m.amount_cents))}<div class="r-opt">${esc(m.reason)}</div></div>`).join('') || '<div class="r-small">Sem lançamentos</div>';
  const html = `<div class="r-title">Açaí da Roça</div><div class="r-center r-label">Relatório de caixa</div><hr class="r-line">
    <div class="r-small">Abertura: ${esc(cashWhen(s.opened_at))}<br>${esc(s.opened_by)}</div>
    ${s.closed_at ? `<div class="r-small">Fechamento: ${esc(cashWhen(s.closed_at))}<br>${esc(s.closed_by)}</div>` : '<div class="r-small">Caixa ainda aberto</div>'}<hr class="r-line">
    <div class="r-label">Vendas</div>${methods}${line('Total vendido', brl(sum.totalSalesCents))}<hr class="r-line">
    <div class="r-label">Dinheiro</div>${line('Troco inicial', brl(sum.openingCents))}${line('Vendas em dinheiro', brl(sum.cashSalesCents))}${line('Entradas', '+' + brl(sum.suppliesCents))}${line('Retiradas', '-' + brl(sum.withdrawalsCents))}${line('Despesas', '-' + brl(sum.expensesCents))}<div class="r-total">${line('Esperado', brl(sum.expectedCashCents))}</div>
    ${s.closed_at ? `${line('Contado', brl(s.counted_cents))}<div class="r-box">${esc(diffText(s.difference_cents))}</div>${s.close_notes ? `<div class="r-small">Obs.: ${esc(s.close_notes)}</div>` : ''}` : ''}<hr class="r-line">
    <div class="r-label">Lançamentos</div>${moves}`;
  printArea().innerHTML = html;
  setTimeout(() => { try { window.print(); } catch (e) { say('O navegador não abriu a impressão: ' + e.message); } }, 150);
}
async function cashAction(fn) {
  try {
    await fn();
  }
  catch (e) {
    say(e.message);
  }
}
document.addEventListener('submit', e => {
  const f = e.target;
  if (!f.matches?.('#cash-open-form, #cash-move-form, #cash-close-form'))
    return;
  e.preventDefault();
  cashAction(async () => {
    const fd = new FormData(f);
    if (f.id === 'cash-open-form') {
      const openingCents = moneyToCents(fd.get('opening'));
      if (openingCents === null)
        return say('Digite o troco inicial em reais. Ex.: 100,00');
      cashLastClosed = null;
      await api('/cash/open', { method: 'POST', body: JSON.stringify({ openingCents, notes: fd.get('notes'), resumeOrders: fd.get('resume') === 'on' }) });
      say('Caixa aberto.');
      if (fd.get('resume') === 'on')
        await loadPauseState();
    }
    else if (f.id === 'cash-move-form') {
      const amountCents = moneyToCents(fd.get('amount'));
      if (!amountCents)
        return say('Digite um valor maior que zero. Ex.: 20,00');
      await api('/cash/movements', { method: 'POST', body: JSON.stringify({ kind: fd.get('kind'), amountCents, reason: fd.get('reason') }) });
      say('Lançamento registrado.');
    }
    else {
      const countedCents = moneyToCents(fd.get('counted'));
      if (countedCents === null)
        return say('Digite o dinheiro contado em reais. Ex.: 250,00');
      if (!confirm('Fechar o caixa agora? Depois de fechado ele não pode ser alterado.'))
        return;
      cashLastClosed = await api('/cash/close', { method: 'POST', body: JSON.stringify({ countedCents, notes: fd.get('notes'), pauseOrders: fd.get('pause') === 'on' }) });
      say('Caixa fechado.');
      if (fd.get('pause') === 'on')
        await loadPauseState();
    }
    await loadCash();
  });
});
document.addEventListener('click', e => {
  const del = e.target.closest?.('[data-cash-del]'), view = e.target.closest?.('[data-cash-view]'), print = e.target.closest?.('[data-cash-print]');
  if (del) {
    cashAction(async () => {
      if (!confirm('Desfazer este lançamento?'))
        return;
      await api('/cash/movements/' + del.dataset.cashDel, { method: 'DELETE' });
      await loadCash();
    });
  }
  if (view) {
    cashAction(async () => {
      const report = await api('/cash/sessions/' + view.dataset.cashView);
      cashLastClosed = null;
      await loadCash();
      $('#cash-root').insertAdjacentHTML('afterbegin', cashReportCard(report, 'Detalhes do caixa'));
      $('#cash-root').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (print) {
    cashAction(async () => printCashReport(await api('/cash/sessions/' + print.dataset.cashPrint)));
  }
});
