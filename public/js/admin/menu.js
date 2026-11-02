async function loadMenu() {
  const d = await api('/menu');
  // Trufados: cada sabor mostra seus próprios tamanhos (400 ml e 500 ml) com o valor editável, igual ao açaí tradicional.
  const truffled = d.products.filter(p => p.product_type === 'truffled');
  const sizeRow = (s, label) => `<form class="price-row" data-kind="size" data-id="${s.id}"><span><strong>${esc(label)}</strong></span><label>Preço (R$)<input type="number" min="0" step="0.01" value="${moneyInput(s.price_cents)}" name="price"></label><label class="mini-check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button></form>`;
  const truffledHtml = truffled.map(p => {
    const sizes = d.sizes.filter(s => s.product_id === p.id);
    return `<div class="truffled-admin-card"><form class="product-active-row" data-id="${p.id}"><strong>${esc(p.name)}</strong><label class="mini-check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button><button type="button" class="button button-small button-danger" data-delete-product="${p.id}">Excluir</button></form>${sizes.map(s => sizeRow(s, 'Tamanho ' + s.name)).join('') || '<p class="muted">Este sabor ainda não tem tamanhos cadastrados.</p>'}</div>`;
  }).join('') || '<p class="muted">Nenhum sabor trufado cadastrado.</p>';
  const traditionalSizes = d.sizes.filter(s => !truffled.some(p => p.id === s.product_id));
  $('#menu-admin').innerHTML = `<h3>Trufados</h3><p class="muted">Cada sabor tem dois tamanhos. Altere o valor de cada um e clique em Salvar. Desmarque “Disponível” no sabor para ocultá-lo do cardápio.</p><div class="admin-option-list">${truffledHtml}</div><h3>Tamanhos</h3><p class="muted">Desative um tamanho para ocultá-lo temporariamente do cardápio, sem apagar seu preço.</p><div class="admin-option-list">${traditionalSizes.map(s => sizeRow(s, s.product_name + ' — ' + s.name)).join('')}</div><h3>Acompanhamentos, caldas e adicionais</h3><p class="muted">Desmarque “Disponível” para retirar uma opção do site até que volte ao estoque.</p><div class="admin-option-list">${d.options.map(o => `<form class="price-row" data-kind="option" data-id="${o.id}"><span><strong>${esc(o.name)}</strong><small>${esc(o.category)}</small></span><label>Preço (R$)<input type="number" min="0" step="0.01" value="${moneyInput(o.price_cents)}" name="price"></label><label class="mini-check"><input type="checkbox" name="active" ${o.active ? 'checked' : ''}> Disponível</label><button class="button button-small button-primary">Salvar</button></form>`).join('')}</div>`;
  document.querySelectorAll('.product-active-row').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/menu/products/' + form.dataset.id, { method: 'PATCH', body: JSON.stringify({ active: form.elements.active.checked }) });
      say('Disponibilidade do sabor atualizada.');
      await loadMenu();
    }
    catch (err) {
      say(err.message);
    }
  }));
  document.querySelectorAll('[data-delete-product]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Excluir permanentemente este sabor e seus tamanhos? Pedidos antigos manterão seus registros.'))
      return;
    try {
      await api('/menu/products/' + b.dataset.deleteProduct, { method: 'DELETE' });
      say('Sabor excluído.');
      await loadMenu();
    }
    catch (e) {
      say(e.message);
    }
  }));
  document.querySelectorAll('.price-row').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form), price = Math.round(Number(fd.get('price')) * 100);
    try {
      await api(`/menu/${form.dataset.kind === 'size' ? 'sizes' : 'options'}/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ priceCents: price, active: fd.get('active') === 'on' }) });
      say('Preço e disponibilidade salvos.');
      await loadMenu();
    }
    catch (err) {
      say(err.message);
    }
  }));
}
