// Lembrete diário de açaí por notificação push (funciona com o site fechado).
// Diferente do "Avisos de pedidos" em settings.js, que só funciona com o site aberto, aqui quem avisa é o servidor.
var dailyPushConfig = null;
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function isIosBrowserTab() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone); }
function pushKeyBytes(base64Url) {
  const raw = atob((base64Url + '='.repeat((4 - base64Url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
// O service worker nunca fica "pronto" se o registro falhou: sem este limite o botão ficaria travado para sempre.
function pushReady() {
  return Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Não foi possível preparar as notificações neste aparelho. Recarregue a página e tente de novo.')), 8000))]);
}
async function dailyPushGetConfig() {
  dailyPushConfig ??= await api('/push/config');
  return dailyPushConfig;
}
// Reaproveita a assinatura do aparelho; se a chave do servidor mudou (VAPID novo), refaz a assinatura.
async function dailyPushSubscription(reg, publicKey) {
  const key = pushKeyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const current = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (current && (current.length !== key.length || current.some((v, i) => v !== key[i]))) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}
async function dailyPushRegister(reg, publicKey) {
  const sub = await dailyPushSubscription(reg, publicKey);
  await api('/push/customer/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
}
function syncDailyPushUI() {
  const toggle = $('#daily-push-toggle'), help = $('#daily-push-help');
  if (!toggle) return;
  const fail = text => { toggle.checked = false; toggle.disabled = true; help.textContent = text; };
  if (isIosBrowserTab()) return fail('No iPhone, instale o app primeiro: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o app instalado e ative o lembrete aqui.');
  if (!pushSupported()) return fail('Este navegador não oferece suporte a notificações.');
  if (Notification.permission === 'denied') return fail('As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.');
  toggle.disabled = false;
  toggle.checked = localStorage.getItem('acaiDailyPush') === '1' && Notification.permission === 'granted';
  dailyPushGetConfig().then(config => { if (!config.enabled) fail('Os lembretes ainda não estão disponíveis. Tente novamente mais tarde.'); }).catch(() => { });
}
$('#daily-push-toggle')?.addEventListener('change', async (e) => {
  const toggle = e.target, msg = $('#daily-push-message'), wantOn = toggle.checked;
  msg.textContent = '';
  msg.classList.remove('error-message');
  toggle.disabled = true;
  try {
    if (wantOn) {
      // Pedir a permissão primeiro (ainda dentro do toque do usuário): alguns navegadores exigem isso.
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permissão não concedida. Ative as notificações no navegador para receber o lembrete.');
      const config = await dailyPushGetConfig();
      if (!config.enabled) throw new Error('Os lembretes ainda não estão disponíveis. Tente novamente mais tarde.');
      await dailyPushRegister(await pushReady(), config.publicKey);
      localStorage.setItem('acaiDailyPush', '1');
      msg.textContent = 'Pronto! Você vai receber 1 lembrete por dia. Para parar, é só desligar aqui.';
    }
    else {
      const sub = await (await pushReady()).pushManager.getSubscription();
      if (sub) await api('/push/customer/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
      localStorage.removeItem('acaiDailyPush');
      msg.textContent = 'Lembrete diário desativado.';
    }
  }
  catch (err) {
    toggle.checked = !wantOn;
    msg.textContent = err.message || 'Não foi possível concluir. Tente novamente.';
    msg.classList.add('error-message');
  }
  toggle.disabled = false;
  syncDailyPushUI();
});
// Ao abrir o site com o lembrete ligado, reenvia a assinatura ao servidor: cura assinaturas apagadas e liga o aparelho à conta, se o cliente entrou depois de ativar.
window.addEventListener('load', async () => {
  if (localStorage.getItem('acaiDailyPush') !== '1' || !pushSupported() || Notification.permission !== 'granted') return;
  try {
    const config = await dailyPushGetConfig();
    if (config.enabled) await dailyPushRegister(await pushReady(), config.publicKey);
  }
  catch { }
});
