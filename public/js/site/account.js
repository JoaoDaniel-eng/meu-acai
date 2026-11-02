// Conta do cliente: login, cadastro, perfil e senha.
// Conta do cliente: celular + senha. Pedidos anteriores não são associados automaticamente.
function setAccountView(signedIn) { $('#account-signed-out').classList.toggle('hidden', signedIn); $('#account-signed-in').classList.toggle('hidden', !signedIn); }
function customerMessage(id, text, error = false) {
  const el = $(id);
  if (el) {
    el.textContent = text;
    el.classList.toggle('error-message', error);
    el.classList.toggle('is-success', !!text && !error);
  }
}
var mustChangeShown = false;
async function loadCustomerAccount() {
  try {
    const data = await api('/customers/me');
    setAccountView(true);
    applyAuthUI(data.customer, data.loyaltyBalance);
    $('#customer-greeting').textContent = `Olá, ${data.customer.name}!`;
    $('#customer-phone-display').textContent = data.customer.phone;
    $('#customer-profile-form [name=name]').value = data.customer.name;
    $('#customer-profile-form [name=phone]').value = data.customer.phone;
    $('#customer-profile-form').dataset.phone = data.customer.phone;
    $('#checkout-form [name=phone]').value = data.customer.phone;
    $('#checkout-form [name=customerName]').value = data.customer.name;
    if (data.mustChangePassword && !mustChangeShown) {
      mustChangeShown = true;
      promptPasswordChange();
    }
  }
  catch {
    localStorage.removeItem('acaiCustomerToken');
    setAccountView(false);
    applyAuthUI(null);
    return;
  }
  loadCustomerOrders();
  loadFavorites();
}
async function loadCustomerOrders() {
  const list = $('#customer-orders-list');
  try {
    const result = await api('/customers/me/orders');
    list.innerHTML = result.orders.length ? result.orders.map(o => `<article class="customer-order-card"><div class="tracking-top"><div><small>${new Date(o.created_at).toLocaleString('pt-BR')}</small><h4>${esc(o.order_code)}</h4></div><span class="status status-${esc(o.status)}">${statusNames[o.status] || esc(o.status)}</span></div><p>${(o.items || []).map(i => `${i.quantity}× ${esc(i.size)}${i.options?.length ? ' — ' + i.options.map(x => esc(x.name)).join(', ') : ''}`).join('<br>')}</p><strong>${brl(o.total_cents)}</strong><button type="button" class="button button-outline customer-track-order" data-order-code="${esc(o.order_code)}" data-order-phone="${esc(o.customer_phone)}">Acompanhar pedido</button></article>`).join('') : '<p class="muted">Você ainda não tem pedidos associados à sua conta. Faça um pedido enquanto estiver conectado e ele aparecerá aqui.</p>';
    customerMessage('#customer-orders-message', '');
  }
  catch (err) {
    if (!list.querySelector('.customer-order-card'))
      list.innerHTML = '<p class="muted">Não foi possível carregar seus pedidos agora.</p>';
  }
}
function promptPasswordChange() {
  openSettings();
  const f = $('#customer-password-form');
  const d = f.closest('details');
  if (d)
    d.open = true;
  customerMessage('#customer-password-message', 'Você entrou com uma senha temporária. Crie uma nova senha para proteger sua conta.', true);
}
$('#customer-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  customerMessage('#customer-login-message', 'Entrando…');
  try {
    const data = await api('/customers/login', { method: 'POST', body: JSON.stringify({ phone: fd.get('phone'), password: fd.get('password') }) });
    localStorage.setItem('acaiCustomerToken', data.token);
    customerMessage('#customer-login-message', '');
    form.reset();
    await loadCustomerAccount();
    $('#minha-conta').scrollIntoView({ behavior: 'smooth' });
  }
  catch (err) {
    customerMessage('#customer-login-message', err.message, true);
  }
});
$('#customer-register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  customerMessage('#customer-register-message', 'Criando sua conta…');
  try {
    const data = await api('/customers/register', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone'), password: fd.get('password') }) });
    localStorage.setItem('acaiCustomerToken', data.token);
    form.reset();
    customerMessage('#customer-register-message', '');
    await loadCustomerAccount();
    $('#minha-conta').scrollIntoView({ behavior: 'smooth' });
  }
  catch (err) {
    customerMessage('#customer-register-message', err.message, true);
  }
});
function doLogout() { localStorage.removeItem('acaiCustomerToken'); localStorage.removeItem('acaiOrderStatuses'); setAccountView(false); applyAuthUI(null); customerMessage('#customer-login-message', 'Você saiu da sua conta.'); }
$('#customer-logout').addEventListener('click', doLogout);
$('#customer-profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget), form = e.currentTarget;
  customerMessage('#customer-profile-message', 'Salvando…');
  try {
    const body = { name: fd.get('name'), phone: fd.get('phone') };
    const changedPhone = String(fd.get('phone') || '').replace(/\D/g, '') !== String(form.dataset.phone || '').replace(/\D/g, '');
    if (changedPhone)
      body.currentPassword = fd.get('currentPassword') || '';
    await api('/customers/me', { method: 'PATCH', body: JSON.stringify(body) });
    form.querySelector('[name=currentPassword]').value = '';
    $('#profile-password-label').classList.add('hidden');
    customerMessage('#customer-profile-message', 'Dados atualizados.');
    await loadCustomerAccount();
  }
  catch (err) {
    customerMessage('#customer-profile-message', err.message, true);
  }
});
$('#customer-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget, fd = new FormData(form);
  try {
    const data = await api('/customers/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') }) });
    customerMessage('#customer-password-message', data.message);
    form.reset();
  }
  catch (err) {
    customerMessage('#customer-password-message', err.message, true);
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('.customer-track-order');
  if (!b)
    return;
  $('#tracking-form [name=code]').value = b.dataset.orderCode;
  $('#tracking-form [name=phone]').value = b.dataset.orderPhone;
  $('#tracking-form').requestSubmit();
  $('#acompanhar').scrollIntoView({ behavior: 'smooth' });
});
