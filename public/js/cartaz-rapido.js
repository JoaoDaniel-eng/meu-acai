// Cartaz imprimível com o QR code do pedido rápido (o endereço é o do próprio site + /rapido).
document.addEventListener('DOMContentLoaded', () => {
  const url = location.origin + '/rapido';
  document.getElementById('poster-link').textContent = url;
  try {
    document.getElementById('poster-qr').innerHTML = qrSvg(url, 8);
  }
  catch {
    document.getElementById('poster-qr').textContent = 'Não foi possível gerar o QR code.';
  }
  document.getElementById('poster-print').addEventListener('click', () => window.print());
});
