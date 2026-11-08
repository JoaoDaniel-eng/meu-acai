// Dados salvos neste aparelho.
// Cadastro rápido opcional: os dados ficam somente neste aparelho (localStorage), sem criar conta e sem ir para o servidor.
// Quem já pediu antes vê um resumo "Confira seus dados" e só confirma; "Alterar dados" abre os campos.
const SAVED_DETAILS_KEY = 'acaiCustomerDetails';
let savedDetailsEditing = false;
function readSavedDetails() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_DETAILS_KEY) || 'null');
  }
  catch {
    return null;
  }
}
function restoreSavedDetails() {
  savedDetailsEditing = false;
  const saved = readSavedDetails();
  if (saved) {
    for (const [key, value] of Object.entries({ customerName: saved.customerName, phone: saved.phone, address: saved.address })) {
      const field = document.querySelector(`#checkout-form [name="${key}"]`);
      if (field && value)
        field.value = value;
    }
    if (saved.zoneId)
      $('#zone-select').value = saved.zoneId;
    $('#save-customer-details').checked = true;
  }
  paintSavedSummary();
}
// Mostra o resumo no lugar dos campos só quando os dados salvos estão completos e válidos
// (assim nenhum campo obrigatório fica escondido e vazio).
function paintSavedSummary() {
  const form = $('#checkout-form'), box = $('#saved-summary');
  if (!form || !box)
    return;
  const f = form.elements;
  const name = String(f.customerName.value || '').trim(), phone = String(f.phone.value || '').trim(), address = String(f.address.value || '').trim();
  const zoneId = $('#zone-select').value, pickup = isPickup();
  const zoneName = zoneId ? (menu?.zones?.find(z => String(z.id) === String(zoneId))?.name || '') : '';
  const complete = name.length >= 2 && phone.replace(/\D/g, '').length >= 10 && (pickup || (address.length >= 6 && !!zoneId));
  const show = !!readSavedDetails() && complete && !savedDetailsEditing;
  form.classList.toggle('saved-collapsed', show);
  box.classList.toggle('hidden', !show);
  if (!show) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<strong>👋 Olá, ${esc(name.split(/\s+/)[0])}! Confira seus dados</strong>`
    + `<p>${esc(name)} · ${esc(phone)}</p>`
    + (pickup ? '' : `<p>${esc(address)}${zoneName ? ' · ' + esc(zoneName) : ''}</p>`)
    + '<div class="saved-summary-actions"><button type="button" class="button button-outline" data-saved-edit>Alterar dados</button>'
    + '<button type="button" class="link-button" data-saved-forget>Não sou eu · apagar dados</button></div>';
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-saved-edit]')) {
    savedDetailsEditing = true;
    paintSavedSummary();
    $('#checkout-form').elements.customerName.focus();
    return;
  }
  if (e.target.closest('[data-saved-forget]')) {
    try {
      localStorage.removeItem(SAVED_DETAILS_KEY);
    }
    catch { }
    const f = $('#checkout-form').elements;
    f.customerName.value = '';
    f.phone.value = '';
    f.address.value = '';
    $('#zone-select').value = '';
    $('#save-customer-details').checked = false;
    savedDetailsEditing = false;
    paintSavedSummary();
    renderCart();
    f.customerName.focus();
  }
});
// Trocar entrega por retirada muda o que o resumo mostra (sem endereço e bairro).
document.addEventListener('change', e => {
  if (e.target.matches('#fulfillment'))
    paintSavedSummary();
});
