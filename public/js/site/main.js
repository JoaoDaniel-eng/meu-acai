// Inicialização do site.
// Roda por último: aqui tudo já foi definido pelos outros arquivos.
if (localStorage.getItem('acaiCustomerToken'))
  loadCustomerAccount();
else {
  setAccountView(false);
  applyAuthUI(null);
}
$('#year').textContent = new Date().getFullYear();
load();
applyTheme(currentThemePref(), false);
applyFontScale(currentFontScale(), false);
