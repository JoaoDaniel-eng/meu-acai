// Pedido em passos: 1 Tamanho → 2 Complementos → 3 Entrega e pagamento.
// O cliente pode juntar açaí, trufado e sorvete: em cada um toca em "Adicionar ao pedido" e, quando terminar, em "Ir para o pedido".
// Só controla o que aparece. Preço, limites, carrinho e envio do pedido continuam em core.js e checkout.js.
// Se este arquivo não carregar, a página volta a mostrar tudo de uma vez (nada fica escondido sem ele).
(function () {
  const LAST = 3;
  const NAMES = ['Tamanho', 'Complementos', 'Entrega e pagamento'];
  let step = 1;

  const builder = () => $('#builder');
  const main = () => $('.builder-main');
  const pedido = () => $('#pedido');
  const nextBtn = () => $('#builder-next');
  const backBtn = () => $('#builder-back');
  // Aba "Açaís Trufados" ou "Sorvetes" ativa: o montador tradicional fica escondido e os passos 1 e 2 não se aplicam.
  const traditionalMode = () => !!main() && !main().classList.contains('hidden');
  const itemCount = () => cart.reduce((n, i) => n + i.quantity, 0);
  const plural = n => `${n} ${n === 1 ? 'item' : 'itens'}`;
  // Quem montou algo e foi direto para o pedido sem tocar em "Adicionar": o item entra junto (ver commitPendingDraft).
  const commitDraft = () => (typeof commitPendingDraft === 'function' ? commitPendingDraft() : false);
  const emptyMessage = () => traditionalMode() && (!selectedSize || halfPending()) ? needSizeMessage() : 'Seu pedido está vazio. Escolha o que quer e toque em “Adicionar ao pedido”.';

  function say(text) {
    const m = $('#builder-step-message');
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('error-message', !!text);
  }

  // Linha "Frete: R$ X · Total com entrega: R$ Y" logo abaixo do bairro (o total do pedido fica lá em cima, fora da tela no celular).
  function paintZoneResult() {
    const box = $('#zone-result');
    if (!box) return;
    const id = $('#zone-select')?.value;
    if (isPickup() || !id || !cart.length) { box.classList.add('hidden'); box.textContent = ''; return; }
    const zone = menu?.zones?.find(z => String(z.id) === String(id));
    box.innerHTML = `<span>🛵 Frete${zone ? ' para ' + esc(zone.name) : ''}: <b>${esc($('#delivery-fee').textContent)}</b></span>`
      + `<span>Total com entrega: <b>${esc($('#cart-final-total').textContent)}</b></span>`;
    box.classList.remove('hidden');
  }

  function paintNav() {
    const next = nextBtn(), back = backBtn(), traditional = traditionalMode(), info = $('#builder-nav-info');
    if (!next || !back) return;
    const count = itemCount();
    $('#builder-nav').classList.toggle('step-off', !traditional && step !== LAST && count === 0);
    back.classList.toggle('step-off', step === 1 || (!traditional && step !== LAST));
    $('#view-order')?.classList.toggle('hidden', count === 0);
    if (step === LAST) {
      info.disabled = true;
      info.classList.remove('is-link');
      info.removeAttribute('aria-label');
      $('#builder-nav-label').textContent = $('#cart-final-label').textContent;
      $('#builder-nav-total').textContent = $('#cart-final-total').textContent;
      const submit = $('#submit-order');
      if (!cart.length) { next.textContent = builderCategory === 'ice_cream' ? 'Montar meu sorvete' : 'Montar meu açaí'; next.disabled = false; }
      else {
        next.disabled = !!submit?.disabled;
        next.textContent = submit?.disabled ? submit.textContent.trim() : 'Fazer pedido';
      }
    } else {
      const chosen = traditional && selectedSize, total = $('#cart-final-total').textContent;
      // Com itens no pedido, o bloco do total vira o atalho "ver pedido" (funciona em qualquer categoria e em qualquer etapa).
      info.disabled = count === 0;
      info.classList.toggle('is-link', count > 0);
      if (count) info.setAttribute('aria-label', `Ir para o pedido: ${plural(count)}, total ${total}`); else info.removeAttribute('aria-label');
      // Texto fixo e contagem (sem conteúdo digitado pelo cliente). O "ver pedido →" só aparece quando a tela tem espaço (CSS .nav-see).
      if (count) $('#builder-nav-label').innerHTML = `🛒 ${plural(count)}${traditional ? '<span class="nav-see"> · ver pedido →</span>' : ''}`;
      else $('#builder-nav-label').textContent = chosen ? `Seu ${builderCategory === 'ice_cream' ? 'sorvete' : 'açaí'}: ${selectedSize.name}` : 'Seu pedido';
      $('#builder-nav-total').textContent = count ? total : (chosen ? brl(priceForBuilder()) : 'R$ 0,00');
      next.disabled = false;
      next.textContent = !traditional ? 'Ir para o pedido →' : (step === 1 ? 'Continuar' : '+ Adicionar ao pedido');
    }
  }

  function paint() {
    const el = main();
    if (!el) return;
    const traditional = traditionalMode();
    if (!traditional && step === 2) step = 1;
    builder().classList.add('is-stepped');
    builder().dataset.flowStep = String(step);
    el.querySelectorAll('[data-step]').forEach(n => n.classList.toggle('step-off', Number(n.dataset.step) !== step));
    el.classList.toggle('step-off', step === LAST);
    pedido().classList.toggle('step-off', step !== LAST);
    $('#menu-category-tabs')?.classList.toggle('step-off', step === LAST);
    document.querySelectorAll('.flavor-menu').forEach(m => m.classList.toggle('step-off', step === LAST));
    $('#builder-steps').classList.toggle('step-off', !traditional);
    document.querySelectorAll('#builder-steps li').forEach((li, i) => {
      const n = i + 1, btn = li.querySelector('button');
      li.classList.toggle('is-active', n === step);
      li.classList.toggle('is-done', n < step);
      li.querySelector('.step-num').textContent = n < step ? '✓' : String(n);
      if (n === step) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
    });
    $('#builder-progress-bar').style.width = `${(step / LAST) * 100}%`;
    if (step === LAST) announceAdded('');
    $('#builder-step-live').textContent = traditional ? `Etapa ${step} de ${LAST}: ${NAMES[step - 1]}` : '';
    paintNav();
  }

  function scrollToTop() {
    const b = builder();
    if (b && b.getBoundingClientRect().top < 70) scrollRespectingMotion(b, { behavior: 'smooth', block: 'start' });
  }

  // Volta para o topo do cardápio, onde ficam as abas Açaí / Trufados / Sorvetes.
  function scrollToMenuTop() {
    const tabs = $('#menu-category-tabs'), el = tabs && !tabs.classList.contains('hidden') ? tabs : builder();
    if (el) scrollRespectingMotion(el, { behavior: 'smooth', block: 'start' });
  }

  // force = true: quem chama já decidiu (atalhos para o pedido); sem validação.
  function goTo(n, force) {
    n = Math.min(Math.max(Number(n) || 1, 1), LAST);
    let msg = '';
    if (!force) {
      if (n === 2 && (!selectedSize || halfPending())) { msg = needSizeMessage(); n = 1; }
      else if (n === LAST) {
        // Quem montou algo e esqueceu de tocar em "Adicionar ao pedido": entra agora, antes de abrir a entrega.
        commitDraft();
        if (!cart.length) { msg = emptyMessage(); n = 1; }
      }
    }
    say(msg);
    const changed = n !== step;
    step = n;
    paint();
    if (changed) scrollToTop();
  }

  document.addEventListener('click', e => {
    const jump = e.target.closest('[data-goto-step]');
    if (jump) { goTo(Number(jump.dataset.gotoStep)); return; }
    // Qualquer link para #pedido (barra do carrinho, topo) abre o último passo.
    if (e.target.closest('a[href="#pedido"]')) { commitDraft(); step = LAST; say(''); paint(); return; }
    // Barra de baixo: o bloco "🛒 N itens · ver pedido" leva ao pedido de qualquer categoria.
    if (e.target.closest('#builder-nav-info.is-link')) { goTo(LAST); return; }
    // Na tela de entrega e pagamento: volta ao cardápio (com as abas) para juntar mais itens ao mesmo pedido.
    if (e.target.closest('#add-more-items')) { step = 1; say(''); paint(); scrollToMenuTop(); return; }
    if (e.target.closest('#builder-back')) {
      goTo(step === LAST ? 1 : step - 1);
      return;
    }
    if (e.target.closest('#builder-next')) {
      if (step === LAST) {
        if (!cart.length) { goTo(1, true); return; }
        $('#submit-order').click();
      } else if (!traditionalMode()) goTo(LAST);
      else if (step === 1) goTo(2);
      else if (!addCurrentToOrder()) say(needSizeMessage());
    }
  });

  // Depois de "Adicionar ao pedido" (açaí, sorvete ou trufado): volta ao começo do cardápio para escolher o próximo item.
  document.addEventListener('acai:item-added', () => { step = 1; say(''); paint(); scrollToMenuTop(); });

  // Chamadas antigas como $('#pedido').scrollIntoView(...) (repetir pedido, trufados, aviso de loja fechada) abrem o passo 3.
  const nativeScroll = Element.prototype.scrollIntoView;
  pedido().scrollIntoView = function (...args) {
    commitDraft(); step = LAST; say(''); paint();
    return nativeScroll.apply(this, args);
  };

  // Trocar de aba (tradicional x trufado) muda o que os passos mostram.
  document.addEventListener('click', e => { if (e.target.closest('[data-menu-category]')) setTimeout(paint, 0); });

  // Mantém frete, total e barra de baixo em dia sempre que o carrinho é redesenhado.
  const baseRenderCart = window.renderCart;
  window.renderCart = function () {
    const result = baseRenderCart.apply(this, arguments);
    if (typeof paintCartNote === 'function') paintCartNote();
    paintZoneResult();
    paint();
    return result;
  };
  // O bairro escolhido atualiza o frete na hora (o ouvinte original do checkout roda antes deste).
  $('#zone-select').addEventListener('change', () => { paintZoneResult(); paintNav(); });
  $('#fulfillment').addEventListener('change', () => { paintZoneResult(); paintNav(); });
  // O botão "Fazer pedido" da barra acompanha o do formulário (desativado/“Registrando pedido…”).
  new MutationObserver(paintNav).observe($('#submit-order'), { attributes: true, childList: true, characterData: true, subtree: true });
  // Enquanto o montador está na tela, a barra de baixo é a dos passos (evita duas barras empilhadas no celular).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => document.body.classList.toggle('in-builder', entries[0].isIntersecting), { threshold: 0 }).observe(builder());
  }
  paint();
})();
