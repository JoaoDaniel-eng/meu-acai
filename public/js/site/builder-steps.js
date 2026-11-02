// Montador do açaí em etapas: 1 Tamanho → 2 Acompanhamentos (e calda) → 3 Adicionais (e finalizar o item).
// Só controla o que aparece: as regras de preço, limites e carrinho continuam em core.js e checkout.js.
(function () {
  const LAST = 3;
  let step = 1;
  const root = () => document.querySelector('.builder-main');
  function optionNames(category) {
    return [...selected].map(id => menu.options.find(o => o.id === id)).filter(o => o && o.category === category).map(o => o.name);
  }
  function paintSummary() {
    const box = $('#builder-summary');
    if (!box) return;
    if (!selectedSize) { box.innerHTML = ''; return; }
    const tops = optionNames('topping'), syrup = optionNames('syrup'), extras = optionNames('extra').concat(optionNames('mousse'));
    box.innerHTML = `<strong>Seu açaí: ${esc(selectedSize.name)}</strong>`
      + `<p>Acompanhamentos: ${tops.length ? esc(tops.join(', ')) : 'nenhum'}</p>`
      + `<p>Calda: ${syrup.length ? esc(syrup.join(', ')) : 'nenhuma'}</p>`
      + `<p>Adicionais: ${extras.length ? esc(extras.join(', ')) : 'nenhum'}</p>`;
  }
  function paint() {
    const el = root();
    if (!el) return;
    if (step > 1 && !selectedSize) step = 1;
    el.querySelectorAll('[data-step]').forEach(n => n.classList.toggle('step-off', Number(n.dataset.step) !== step));
    document.querySelectorAll('#builder-steps li').forEach((li, i) => {
      const n = i + 1, btn = li.querySelector('button');
      li.classList.toggle('is-active', n === step);
      li.classList.toggle('is-done', n < step);
      if (n === step) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
    });
    $('#builder-back').classList.toggle('step-off', step === 1);
    $('#builder-next').classList.toggle('step-off', step === LAST);
    const price = $('#builder-nav-price');
    price.classList.toggle('step-off', step === LAST || !selectedSize);
    price.textContent = selectedSize ? `${brl(priceForBuilder())} por unidade` : '';
    paintSummary();
  }
  function goTo(n, keepScroll) {
    if (n > 1 && !selectedSize) { builderMessage('Escolha um tamanho para continuar.'); step = 1; paint(); return; }
    builderMessage('');
    step = Math.min(Math.max(n, 1), LAST);
    paint();
    if (keepScroll) return;
    const top = $('#builder-steps').getBoundingClientRect().top;
    if (top < 70) $('#builder-steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.addEventListener('click', e => {
    const jump = e.target.closest('[data-goto-step]');
    if (jump) { goTo(Number(jump.dataset.gotoStep)); return; }
    if (e.target.closest('#builder-next')) { goTo(step + 1); return; }
    if (e.target.closest('#builder-back')) goTo(step - 1);
  });
  // Mantém o resumo e o preço em dia sempre que o montador é redesenhado.
  const baseRender = window.renderBuilder;
  window.renderBuilder = function () { baseRender.apply(this, arguments); paint(); };
  // Depois de adicionar um item, volta ao início para montar o próximo (o tamanho continua escolhido).
  window.builderAfterAdd = function () {
    step = 1;
    paint();
    if ($('#builder-steps').getBoundingClientRect().top < 70) $('#builder-steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  paint();
})();
