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
async function loadMenu() {
  const d = await api('/menu'), scrollY = window.scrollY;
  $('#menu-admin').innerHTML = `<h3>Produtos</h3><div class="admin-option-list">${d.products.map(p => p.product_type === 'truffled' ? truffleCard(p, d.sizes.filter(s => s.product_id === p.id)) : `<form class="product-active-row" data-id="${p.id}"><strong>${esc(p.name)} <small>${p.product_type === 'truffled' ? 'Trufado' : 'Tradicional'}</small></strong><label>Imagem (URL)<input type="url" name="imageUrl" maxlength="1000" value="${esc(p.image_url || '')}" placeholder="https://… ou /images/…"></label><label class="mini-check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button><button type="button" class="button button-small button-danger" data-delete-product="${p.id}">Excluir</button></form>`).join('')}</div><h3>Tamanhos</h3><p class="muted">Desative um tamanho para ocultá-lo temporariamente do cardápio, sem apagar seu preço. Os tamanhos e o estoque dos trufados ficam dentro de cada trufado, em Produtos.</p><div class="admin-option-list">${d.sizes.filter(s => s.product_type !== 'truffled').map(s => `<form class="price-row" data-kind="size" data-id="${s.id}"><span><strong>${esc(s.product_name)} — ${esc(s.name)}</strong></span><label>Preço (R$)<input type="number" min="0" step="0.01" value="${moneyInput(s.price_cents)}" name="price"></label><label class="mini-check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button></form>`).join('')}</div><h3>Acompanhamentos, caldas e adicionais</h3><p class="muted">Desmarque “Disponível” para retirar uma opção do site até que volte ao estoque.</p><div class="admin-option-list">${d.options.map(o => `<form class="price-row" data-kind="option" data-id="${o.id}"><span><strong>${esc(o.name)}</strong><small>${esc(o.category)}</small></span><label>Preço (R$)<input type="number" min="0" step="0.01" value="${moneyInput(o.price_cents)}" name="price"></label><label class="mini-check"><input type="checkbox" name="active" ${o.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button></form>`).join('')}</div>`;
  window.scrollTo(0, scrollY);
  document.querySelectorAll('.truffle-card').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      // Imagem não é enviada aqui: a que já está cadastrada continua como está.
      await api('/menu/products/' + form.dataset.id, { method: 'PATCH', body: JSON.stringify({ active: form.elements.active.checked }) });
      for (const box of form.querySelectorAll('.truffle-size')) {
        const id = box.dataset.sizeId, stock = form.elements['stock-' + id];
        const body = { priceCents: Math.round(Number(form.elements['price-' + id].value) * 100), active: form.elements['size-active-' + id].checked };
        // Só envia a quantidade se a dona mexeu nela (evita sobrescrever vendas feitas com a tela aberta).
        if (stock.value.trim() !== stock.dataset.original) body.stockQuantity = stock.value.trim() === '' ? null : Number(stock.value);
        await api('/menu/sizes/' + id, { method: 'PATCH', body: JSON.stringify(body) });
      }
      say('Trufado salvo.');
      await loadMenu();
      const msg = document.querySelector(`.truffle-card[data-id="${form.dataset.id}"] .truffle-msg`);
      if (msg) msg.textContent = '✔ Salvo!';
    }
    catch (err) {
      say(err.message);
      const msg = form.querySelector('.truffle-msg');
      if (msg) { msg.textContent = err.message; msg.classList.add('error-message'); }
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
