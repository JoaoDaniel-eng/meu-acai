// Esqueci minha senha: o cliente informa o celular, a nova senha e a confirmação.
$('#forgot-password-btn').addEventListener('click', () => {
  const box = $('#forgot-form');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    const typed = String($('#customer-login-form [name=phone]').value || '').trim();
    if (typed && !box.elements.phone.value)
      box.elements.phone.value = typed;
  }
});
$('#forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget, fd = new FormData(form);
  if (fd.get('newPassword') !== fd.get('confirmPassword')) {
    customerMessage('#forgot-message', 'A confirmação da senha não confere com a nova senha.', true);
    return;
  }
  customerMessage('#forgot-message', 'Redefinindo…');
  try {
    const data = await api('/customers/reset-password', { method: 'POST', body: JSON.stringify({ phone: fd.get('phone'), newPassword: fd.get('newPassword'), confirmPassword: fd.get('confirmPassword') }) });
    $('#customer-login-form [name=phone]').value = fd.get('phone');
    form.reset();
    form.classList.add('hidden');
    customerMessage('#forgot-message', '');
    customerMessage('#customer-login-message', data.message);
    $('#customer-login-form [name=password]').focus();
  }
  catch (err) {
    customerMessage('#forgot-message', err.message, true);
  }
});
