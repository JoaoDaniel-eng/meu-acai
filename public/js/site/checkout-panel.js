// "Finalizar pedido" em tela própria: o bloco #pedido abre como painel (ver panels.js) pela barra
// "Ver pedido", pelo botão "Meu pedido" do topo ou ao repetir/adicionar itens pela conta.
// Aqui fica só o aviso rápido de "adicionado ao pedido" (o carrinho e o envio continuam em core.js e checkout.js).
(function () {
  let timer = 0;
  window.showCartToast = function (text) {
    let t = document.getElementById('cart-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cart-toast';
      t.className = 'cart-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = '✓ ' + text;
    t.classList.add('is-on');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => t.classList.remove('is-on'), 2600);
  };
})();
