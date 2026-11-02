// Painéis em tela cheia: "Acompanhar pedido" e "Minha conta" saem da rolagem principal
// e abrem por cima do site (menu lateral, links do topo ou botões do próprio site).
(function () {
  let openPanelEl = null;
  const origScroll = Element.prototype.scrollIntoView;
  function setVisible(p, on) {
    p.classList.toggle('panel-open', on);
    p.setAttribute('aria-hidden', String(!on));
    document.body.classList.toggle('panel-lock', on);
  }
  function openPanel(p) {
    if (openPanelEl === p) return;
    if (openPanelEl) setVisible(openPanelEl, false);
    openPanelEl = p;
    setVisible(p, true);
    p.scrollTop = 0;
    if (!(history.state && history.state.panel)) { try { history.pushState({ panel: p.id }, ''); } catch { /* sem histórico */ } }
  }
  function closePanel(viaPop) {
    if (!openPanelEl) return;
    setVisible(openPanelEl, false);
    openPanelEl = null;
    if (!viaPop && history.state && history.state.panel) history.back();
  }
  // Qualquer rolagem até um elemento passa a abrir/fechar o painel certo.
  Element.prototype.scrollIntoView = function (...args) {
    const panel = this.closest && this.closest('.panel-view');
    if (panel) { openPanel(panel); setTimeout(() => origScroll.apply(this, args), 30); return; }
    if (openPanelEl) { closePanel(); setTimeout(() => origScroll.apply(this, args), 60); return; }
    return origScroll.apply(this, args);
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-panel-close]')) { closePanel(); return; }
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target && target.closest('.panel-view')) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (openPanelEl && target) { e.preventDefault(); closePanel(); setTimeout(() => origScroll.call(target, { behavior: 'smooth', block: 'start' }), 60); }
  });
  window.addEventListener('popstate', () => closePanel(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPanelEl && !document.body.classList.contains('menu-open')) closePanel(); });
})();
