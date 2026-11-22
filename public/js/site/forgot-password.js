// Esqueci minha senha: o cliente informa o celular, a nova senha e a confirmação.
// Fica dentro do formulário de login, então usa botão (type=button) e não um <form> aninhado.
const forgotBox = $('#forgot-form');
const forgotField = name => forgotBox.querySelector(`[name=${name}]`);
$('#forgot-password-btn').addEventListener('click', () => {
  forgotBox.classList.toggle('hidden');
  if (!forgotBox.classList.contains('hidden')) {
    const typed = String($('#customer-login-form [name=phone]').value || '').trim();
    if (typed && !forgotField('phone').value)
      forgotField('phone').value = typed;
    forgotField(typed ? 'newPassword' : 'phone').focus();
  }
});
async function submitForgotPassword() {
  const phone = forgotField('phone').value, newPassword = forgotField('newPassword').value, confirmPassword = forgotField('confirmPassword').value;
  if (!phone.trim() || !newPassword || !confirmPassword) {
    customerMessage('#forgot-message', 'Preencha o celular, a nova senha e a confirmação.', true);
    return;
  }
  if (newPassword !== confirmPassword) {
    customerMessage('#forgot-message', 'A confirmação da senha não confere com a nova senha.', true);
    return;
  }
  customerMessage('#forgot-message', 'Redefinindo…');
  try {
    const data = await api('/customers/reset-password', { method: 'POST', body: JSON.stringify({ phone, newPassword, confirmPassword }) });
    $('#customer-login-form [name=phone]').value = phone;
    forgotBox.querySelectorAll('input').forEach(i => { i.value = ''; });
    forgotBox.classList.add('hidden');
    customerMessage('#forgot-message', '');
    customerMessage('#customer-login-message', data.message);
    $('#customer-login-form [name=password]').focus();
  }
  catch (err) {
    customerMessage('#forgot-message', err.message, true);
  }
}
$('#forgot-submit').addEventListener('click', submitForgotPassword);
forgotBox.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitForgotPassword();
  }
});
