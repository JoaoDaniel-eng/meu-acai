// Texto de apoio do estoque por unidade (trufados) no painel.
function stockHint(stock) {
  if (stock === null || stock === undefined) return 'Sem controle de estoque';
  if (Number(stock) === 0) return '⛔ Esgotado no cardápio';
  if (Number(stock) <= 3) return `⚠️ Aparece como “${Number(stock) === 1 ? 'Último!' : 'Os ' + stock + ' últimos!'}” para o cliente`;
  return `${stock} disponíveis`;
}
// Card de trufado: nome, disponibilidade e os tamanhos (preço, disponível e quantidade pronta) no mesmo lugar.
function truffleCard(p, sizes) {
  const box = s => `<div class="truffle-size" data-size-id="${s.id}"><strong>${esc(s.name)}</strong><label>Quantidade pronta<input type="number" min="0" max="9999" step="1" name="stock-${s.id}" inputmode="numeric" placeholder="sem limite" value="${s.stock_quantity ?? ''}" data-original="${s.stock_quantity ?? ''}"></label><small class="stock-hint">${s.active ? stockHint(s.stock_quantity) : '🚫 Escondido do site: marque “Tamanho disponível” e salve'}</small><label>Preço (R$)<input type="number" min="0" step="0.01" name="price-${s.id}" value="${moneyInput(s.price_cents)}"></label><label class="mini-check"><input type="checkbox" name="size-active-${s.id}" ${s.active ? 'checked' : ''}> Tamanho disponível</label></div>`;
  return `<form class="truffle-card" data-id="${p.id}"><div class="truffle-card-head"><strong>${esc(p.name)} <small>Trufado</small></strong><label class="mini-check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button><button type="button" class="button button-small button-danger" data-delete-product="${p.id}">Excluir</button></div><p class="form-message truffle-msg" role="status"></p><div class="truffle-sizes">${sizes.map(box).join('') || '<p class="muted">Este sabor não tem tamanhos cadastrados.</p>'}</div></form>`;
}
// Formulário para cadastrar um novo sabor trufado (nome, imagem opcional e os tamanhos com preço e quantidade pronta).
function newFlavorForm() {
  const size = (n, price) => `<div class="truffle-size"><strong>${n}</strong><label>Preço (R$)<input type="number" min="0" step="0.01" name="price-${n}" value="${price}" required></label><label>Quantidade pronta<input type="number" min="0" max="9999" step="1" name="stock-${n}" inputmode="numeric" placeholder="sem limite"></label></div>`;
  return `<details class="truffle-new" id="truffle-new-box"><summary>➕ Novo sabor trufado</summary><form id="truffle-new" class="truffle-card"><label>Nome do sabor<input name="name" required minlength="2" maxlength="120" placeholder="Ex.: Ninho com Oreo"></label><label>Imagem (URL) — opcional<input type="url" name="imageUrl" maxlength="1000" placeholder="https://… ou /images/…"></label><div class="truffle-sizes">${size('400 ml', '20.00')}${size('500 ml', '25.00')}</div><p class="muted">O sabor entra no cardápio já disponível. Deixe a quantidade em branco para vender sem limite.</p><p class="form-message" id="truffle-new-msg" role="status"></p><button class="button button-primary">Adicionar sabor</button></form></details>`;
}
async function loadMenu() {
  const d = await api('/menu'), scrollY = window.scrollY;
  $('#menu-admin').innerHTML = `<h3>Produtos</h3>${newFlavorForm()}<div class="admin-option-list">${d.products.map(p => p.product_type === 'truffled' ? truffleCard(p, d.sizes.filter(s => s.product_id === p.id)) : `<form class="product-active-row" data-id="${p.id}"><strong>${esc(p.name)} <small>${p.product_type === 'truffled' ? 'Trufado' : 'Tradicional'}</small></strong><label>Imagem (URL)<input type="url" name="imageUrl" maxlength="1000" value="${esc(p.image_url || '')}" placeholder="https://… ou /images/…"></label><label class="mini-check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button><button type="button" class="button button-small button-danger" data-delete-product="${p.id}">Excluir</button></form>`).join('')}</div><h3>Tamanhos</h3><p class="muted">Desative um tamanho para ocultá-lo temporariamente do cardápio, sem apagar seu preço. Os tamanhos e o estoque dos trufados ficam dentro de cada trufado, em Produtos.</p><div class="admin-option-list">${d.sizes.filter(s => s.product_type !== 'truffled').map(s => `<form class="price-row" data-kind="size" data-id="${s.id}"><span><strong>${esc(s.product_name)} — ${esc(s.name)}</strong></span><label>Preço (R$)<input type="number" min="0" step="0.01" value="${moneyInput(s.price_cents)}" name="price"></label><label class="mini-check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button></form>`).join('')}</div><h3>Acompanhamentos, caldas e adicionais</h3><p class="muted">Desmarque “Disponível” para retirar uma opção do site até que volte ao estoque.</p><div class="admin-option-list">${d.options.map(o => `<form class="price-row" data-kind="option" data-id="${o.id}"><span><strong>${esc(o.name)}</strong><small>${esc(o.category)}</small></span><label>Preço (R$)<input type="number" min="0" step="0.01" value="${moneyInput(o.price_cents)}" name="price"></label><label class="mini-check"><input type="checkbox" name="active" ${o.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button></form>`).join('')}</div>`;
  window.scrollTo(0, scrollY);
  $('#truffle-new').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, msg = $('#truffle-new-msg'), toCents = v => Math.round(Number(v) * 100);
    msg.classList.remove('error-message');
    msg.textContent = 'Salvando…';
    const sizes = ['400 ml', '500 ml'].map(n => ({ name: n, priceCents: toCents(f.elements['price-' + n].value), stockQuantity: f.elements['stock-' + n].value.trim() === '' ? null : Number(f.elements['stock-' + n].value) }));
    const name = f.elements.name.value.trim();
    try {
      await api('/menu/truffled', { method: 'POST', body: JSON.stringify({ name, imageUrl: f.elements.imageUrl.value.trim(), sizes }) });
      say(`Sabor “${name}” adicionado.`);
      await loadMenu();
      // Deixa o formulário aberto (para cadastrar outro) e confirma nele.
      $('#truffle-new-box').open = true;
      const done = $('#truffle-new-msg');
      done.textContent = `✔ “${name}” adicionado aos trufados.`;
    }
    catch (err) {
      msg.textContent = err.message;
      msg.classList.add('error-message');
      say(err.message);
    }
  });
  document.querySelectorAll('.truffle-card[data-id]').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Guarda o card e o id de ANTES do recarregamento: o painel é redesenhado ao salvar e a confirmação tem que cair no mesmo sabor.
    const productId = form.dataset.id, flavor = form.querySelector('.truffle-card-head strong')?.firstChild?.textContent.trim() || 'Trufado';
    const msg = form.querySelector('.truffle-msg');
    if (msg) { msg.textContent = 'Salvando…'; msg.classList.remove('error-message'); }
    try {
      // Imagem não é enviada aqui: a que já está cadastrada continua como está.
      const product = await api('/menu/products/' + productId, { method: 'PATCH', body: JSON.stringify({ active: form.elements.active.checked }) });
      if (product.id !== undefined && String(product.id) !== String(productId))
        throw new Error(`O servidor respondeu com outro sabor ao salvar ${flavor}. Atualize a página e tente de novo.`);
      const saved = [];
      for (const box of form.querySelectorAll('.truffle-size')) {
        const id = box.dataset.sizeId, stock = form.elements['stock-' + id], sizeName = box.querySelector('strong')?.textContent.trim() || 'tamanho';
        const body = { priceCents: Math.round(Number(form.elements['price-' + id].value) * 100), active: form.elements['size-active-' + id].checked };
        // Só envia a quantidade se a dona mexeu nela (evita sobrescrever vendas feitas com a tela aberta).
        const stockChanged = stock.value.trim() !== stock.dataset.original;
        if (stockChanged) body.stockQuantity = stock.value.trim() === '' ? null : Number(stock.value);
        const row = await api('/menu/sizes/' + id, { method: 'PATCH', body: JSON.stringify(body) });
        // Confere o que o servidor gravou: nunca mostra "Salvo!" se a quantidade ou o tamanho não bateram.
        if (row.id !== undefined && String(row.id) !== String(id))
          throw new Error(`O servidor respondeu com outro tamanho ao salvar ${flavor} ${sizeName}. Atualize a página e tente de novo.`);
        if (stockChanged && (row.stock_quantity ?? null) !== body.stockQuantity)
          throw new Error(`A quantidade de ${flavor} ${sizeName} não foi gravada. Atualize a página e tente de novo.`);
        saved.push(`${sizeName}: ${row.stock_quantity ?? 'sem limite'}`);
      }
      say(`${flavor} salvo.`);
      await loadMenu();
      // O card foi redesenhado: acha de novo pelo id do sabor e escreve a confirmação nele.
      const fresh = document.querySelector(`.truffle-card[data-id="${productId}"] .truffle-msg`);
      if (fresh) { fresh.classList.remove('error-message'); fresh.textContent = `✔ ${flavor} salvo! ${saved.join(' · ')}`; }
    }
    catch (err) {
      say(err.message);
      if (msg && msg.isConnected) { msg.textContent = err.message; msg.classList.add('error-message'); }
    }
  }));
  document.querySelectorAll('.product-active-row').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/menu/products/' + form.dataset.id, { method: 'PATCH', body: JSON.stringify({ active: form.elements.active.checked, imageUrl: form.elements.imageUrl.value.trim() }) });
      say('Disponibilidade do produto atualizada.');
      await loadMenu();
    }
    catch (err) {
      say(err.message);
    }
  }));
  document.querySelectorAll('[data-delete-product]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Excluir permanentemente este produto e seus tamanhos? Pedidos antigos manterão seus registros.'))
      return;
    try {
      await api('/menu/products/' + b.dataset.deleteProduct, { method: 'DELETE' });
      say('Produto excluído.');
      await loadMenu();
    }
    catch (e) {
      say(e.message);
    }
  }));
  document.querySelectorAll('.price-row').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form), price = Math.round(Number(fd.get('price')) * 100), body = { priceCents: price, active: fd.get('active') === 'on' };
    // Estoque por unidade: só envia quando a dona mexeu no campo (senão um preço salvo com a tela velha apagaria as vendas feitas nesse meio tempo).
    const stockInput = form.elements.stock, stockChanged = Boolean(stockInput) && stockInput.value.trim() !== stockInput.dataset.original;
    if (stockChanged) body.stockQuantity = stockInput.value.trim() === '' ? null : Number(stockInput.value);
    try {
      await api(`/menu/${form.dataset.kind === 'size' ? 'sizes' : 'options'}/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      say(stockChanged ? 'Preço, disponibilidade e estoque salvos.' : 'Preço e disponibilidade salvos.');
      await loadMenu();
    }
    catch (err) {
      say(err.message);
    }
  }));
}
