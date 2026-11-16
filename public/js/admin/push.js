// Avisos de novo pedido por notificação push: chegam no celular ou computador do administrador mesmo com o painel fechado.
// O aviso sonoro de sound.js continua funcionando enquanto o painel está aberto; este complementa quando ele está fechado.
// O painel fica fora de /api/admin de propósito: assim o cadastro do aparelho não entra no registro de auditoria.
function adminPushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function adminPushKeyBytes(base64Url) {
  const raw = atob((base64Url + '='.repeat((4 - base64Url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
// Chamada com o token explícito para poder funcionar também no instante do logout, quando `token` já foi limpo.
async function adminPushApi(path, body, authToken = token) {
  const r = await fetch('/api/push' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Falha na solicitação.');
  return d;
}
function adminPushReady() {
  return Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Não foi possível preparar as notificações neste aparelho. Recarregue a página e tente de novo.')), 8000))]);
}
// O painel e o site compartilham o mesmo service worker (escopo "/"): registrar aqui garante que o push chegue mesmo que o site nunca tenha sido aberto neste aparelho.
if ('serviceWorker' in navigator)
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(err => console.warn('Notificações indisponíveis:', err)));
function paintPushButton(on, label) {
  const b = $('#push-toggle');
  b.classList.remove('hidden');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = label || (on ? '📲 Avisos no celular: ligados' : '📲 Avisos no celular: desligados');
}
// Atualiza o botão e a contagem de clientes com lembrete diário. Chamada ao abrir o painel e a aba de configurações.
async function paintPush() {
  const b = $('#push-toggle');
  if (!b || !token) return;
  if (!adminPushSupported()) { paintPushButton(false, '📲 Avisos no celular: sem suporte neste navegador'); b.disabled = true; return; }
  try {
    const config = await (await fetch('/api/push/config')).json();
    if (!config.enabled) { paintPushButton(false, '📲 Avisos no celular: configure as chaves no servidor'); b.disabled = true; return; }
    b.disabled = false;
    const sub = Notification.permission === 'granted' ? await (await adminPushReady()).pushManager.getSubscription() : null;
    const status = await adminPushApi('/admin/status', { endpoint: sub?.endpoint || '' });
    paintPushButton(status.subscribed && Notification.permission === 'granted');
    const count = $('#push-customers-count');
    if (count) count.textContent = status.customers === 1 ? '1 cliente recebe o lembrete.' : `${status.customers} clientes recebem o lembrete.`;
  }
  catch (err) { console.warn('Avisos no celular:', err.message); }
}
async function adminPushEnable() {
  // Permissão primeiro, ainda dentro do clique: alguns navegadores exigem isso.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
  const config = await (await fetch('/api/push/config')).json();
  if (!config.enabled) throw new Error('As chaves de notificação (VAPID) ainda não foram configuradas no servidor.');
  const reg = await adminPushReady(), key = adminPushKeyBytes(config.publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Se a chave do servidor mudou, a assinatura antiga não serve mais.
    const current = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (current && (current.length !== key.length || current.some((v, i) => v !== key[i]))) { await sub.unsubscribe(); sub = null; }
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const r = await adminPushApi('/admin/subscribe', { subscription: sub.toJSON() });
  say(r.testSent ? '📲 Avisos ligados! Você deve receber uma notificação de teste agora.' : '📲 Avisos ligados neste aparelho.');
}
async function adminPushDisable() {
  const sub = adminPushSupported() ? await (await adminPushReady()).pushManager.getSubscription() : null;
  if (sub) await adminPushApi('/admin/unsubscribe', { endpoint: sub.endpoint });
  say('Avisos de pedidos desligados neste aparelho.');
}
// Ao sair do painel, este aparelho deixa de receber avisos (mesmo que o administrador esqueça de desligar).
async function adminPushForget(authToken) {
  try {
    if (!adminPushSupported() || Notification.permission !== 'granted') return;
    const sub = await (await adminPushReady()).pushManager.getSubscription();
    if (sub) await adminPushApi('/admin/unsubscribe', { endpoint: sub.endpoint }, authToken);
  }
  catch { }
}
$('#push-toggle').addEventListener('click', async () => {
  const b = $('#push-toggle'), wasOn = b.getAttribute('aria-pressed') === 'true';
  b.disabled = true;
  try {
    if (wasOn) await adminPushDisable();
    else await adminPushEnable();
  }
  catch (err) { say(err.message || 'Não foi possível alterar os avisos.'); }
  b.disabled = false;
  paintPush();
});
$('#push-preview').addEventListener('click', async () => {
  const b = $('#push-preview');
  b.disabled = true;
  try {
    const r = await adminPushApi('/admin/preview');
    say(r.sent ? `Prévia enviada: “${r.title}”. Confira a notificação no aparelho.` : 'A prévia não pôde ser entregue. Desligue e ligue os avisos de novo.');
  }
  catch (err) { say(err.message); }
  b.disabled = false;
});
