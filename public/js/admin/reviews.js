// O painel de estoque fica em /js/admin-inventory/ (loadInventory, diálogos e cadastro).
// Etiqueta do ponto por avaliação (1 por cliente, dado quando a loja aprova uma avaliação feita com conta).
function pointsBadge(r) {
  if (r.points_given)
    return '<span class="review-points-badge is-given">💜 Ponto dado (+1)</span>';
  if (!r.has_account)
    return '<span class="review-points-badge is-none">Visitante: sem ponto</span>';
  if (r.can_earn)
    return `<span class="review-points-badge">${r.approved ? '🎁 Cliente ainda sem o ponto' : '🎁 Ganha 1 ponto ao aprovar'}</span>`;
  return '<span class="review-points-badge is-none">Cliente já ganhou o ponto de avaliação</span>';
}
async function loadReviews() {
  const rows = await api('/reviews');
  $('#reviews-admin').innerHTML = rows.length ? rows.map(r => `<article class="admin-review"><div><strong>${esc(r.customer_name)}</strong> <span class="stars">${'★'.repeat(r.rating)}</span><p>${esc(r.comment)}</p>${r.has_photo ? `<button type="button" class="admin-review-photo" data-photo-id="${r.id}" aria-label="Ampliar foto de ${esc(r.customer_name)}"><span class="muted">Carregando foto…</span></button>` : ''}<small>${new Date(r.created_at).toLocaleString('pt-BR')} · ${r.approved ? 'Publicada' : 'Pendente'}${r.has_photo ? ' · com foto' : ''}</small>${pointsBadge(r)}</div><div class="review-actions">${r.approved ? '' : `<button class="button button-small button-primary" data-approve="${r.id}">Aprovar</button>`}<button class="button button-small button-danger" data-delete-review="${r.id}">Excluir</button></div></article>`).join('') : '<p class="muted">Nenhuma avaliação recebida.</p>';
  document.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
    try {
      const res = await api('/reviews/' + b.dataset.approve, { method: 'PATCH', body: JSON.stringify({ approved: true }) });
      say(res.pointsAwarded ? 'Avaliação aprovada. O cliente ganhou 1 ponto.' : res.alreadyRewarded ? 'Avaliação aprovada. Este cliente já ganhou o ponto de avaliação.' : res.hasAccount ? 'Avaliação aprovada.' : 'Avaliação aprovada (visitante: sem ponto).');
      loadReviews();
      loadStats();
    }
    catch (e) {
      say(e.message);
    }
  }));
  document.querySelectorAll('[data-delete-review]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Excluir esta avaliação?'))
      return;
    try {
      await api('/reviews/' + b.dataset.deleteReview, { method: 'DELETE' });
      loadReviews();
      loadStats();
    }
    catch (e) {
      say(e.message);
    }
  }));
  loadReviewPhotos();
  loadPhotoMigration();
}
// Fotos antigas ficam no banco; este aviso aparece só enquanto houver alguma e move tudo para o armazenamento de arquivos.
async function loadPhotoMigration() {
  try {
    const st = await api('/reviews/photos-pending');
    const box = $('#reviews-admin');
    box.querySelector('.photo-migration')?.remove();
    if (!st.pending)
      return;
    const div = document.createElement('div');
    div.className = 'photo-migration';
    const p = document.createElement('p');
    p.className = 'muted';
    div.append(p);
    if (!st.configured) {
      p.textContent = `Há ${st.pending} foto(s) de avaliações guardada(s) no banco. Para movê-las para o armazenamento de arquivos, defina CLOUDINARY_URL no servidor.`;
    }
    else {
      p.textContent = `Há ${st.pending} foto(s) de avaliações guardada(s) no banco, que ocupa espaço do plano gratuito.`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'button button-small button-primary';
      b.textContent = 'Mover fotos para o armazenamento';
      b.addEventListener('click', async () => {
        b.disabled = true;
        let left = st.pending, stuck = 0;
        try {
          while (left > 0 && stuck < 2) {
            b.textContent = `Movendo… faltam ${left}`;
            const r = await api('/reviews/migrate-photos', { method: 'POST', body: '{}' });
            stuck = r.migrated ? 0 : stuck + 1;
            left = r.pending;
          }
          say(left ? `Ainda restam ${left} foto(s). Tente de novo em instantes.` : 'Fotos movidas com sucesso.');
        }
        catch (e) {
          say(e.message);
        }
        loadReviews();
      });
      div.append(b);
    }
    box.prepend(div);
  }
  catch (e) { /* sem aviso se a consulta falhar */ }
}
// As fotos exigem login, então são baixadas com o token e mostradas por um endereço temporário.
const reviewPhotoUrls = [];
async function loadReviewPhotos() {
  reviewPhotoUrls.splice(0).forEach(u => URL.revokeObjectURL(u));
  for (const btn of document.querySelectorAll('[data-photo-id]')) {
    try {
      const r = await fetch('/api/admin/reviews/' + btn.dataset.photoId + '/photo', { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok)
        throw new Error();
      const url = URL.createObjectURL(await r.blob());
      reviewPhotoUrls.push(url);
      btn.innerHTML = `<img src="${url}" alt="Foto enviada pelo cliente">`;
      btn.dataset.full = url;
    }
    catch {
      btn.innerHTML = '<span class="muted">Foto indisponível</span>';
    }
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-photo-id]');
  if (!b || !b.dataset.full)
    return;
  const v = document.createElement('div');
  v.className = 'photo-viewer';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-modal', 'true');
  v.innerHTML = `<button type="button" class="photo-viewer-close" aria-label="Fechar foto">×</button><img src="${b.dataset.full}" alt="Foto ampliada">`;
  v.addEventListener('click', () => v.remove());
  document.body.appendChild(v);
});
