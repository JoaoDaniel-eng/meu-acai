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

// Convite flutuante: aparece poucos segundos depois que o cliente abre o site. A opção existe em Configurações, mas quase ninguém abre lá.
// Só aparece para quem ainda não decidiu. Usa o mesmo interruptor das Configurações (mesma lógica de permissão e cadastro).
// Não chama a permissão do navegador sozinho (o Chrome esconde esse pedido e o iPhone bloqueia): o pedido nativo só abre depois do toque em \"Quero receber\".
// \"Agora não\" esconde o convite por 7 dias.
(function pushInvite() {
  const KEY = 'acaiPushInviteDismissed', HIDE_MS = 7 * 86400000, SHOW_AFTER_MS = 3000;
  if (!pushSupported() || isIosBrowserTab()) return;
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < HIDE_MS || localStorage.getItem('acaiDailyPush') === '1') return; } catch { return; }
  if (Notification.permission !== 'default') return;
  dailyPushGetConfig().then(config => {
    if (!config.enabled) return;
    const box = document.createElement('div');
    box.className = 'push-invite push-invite-float';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Receber promoções');
    box.innerHTML = '<p><strong>🔔 Quer receber nossas promoções?</strong><br><span class="muted">Avisamos no seu celular das ofertas e lembramos de você no fim da tarde. Você desliga quando quiser.</span></p><div class="push-invite-actions"><button type="button" class="button button-green button-small" id="push-invite-yes">Quero receber</button><button type="button" class="button button-outline button-small" id="push-invite-no">Agora não</button></div><p class="form-message" id="push-invite-msg" role="status"></p>';
    setTimeout(() => { if (document.body.dataset.pushInviteShown) return; document.body.dataset.pushInviteShown = '1'; document.body.appendChild(box); }, SHOW_AFTER_MS);
    $('#push-invite-no').addEventListener('click', () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { } box.remove(); });
    $('#push-invite-yes').addEventListener('click', async () => {
      const toggle = $('#daily-push-toggle'), msg = $('#push-invite-msg'), btn = $('#push-invite-yes');
      if (!toggle) return;
      btn.disabled = true;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      // O interruptor cuida da permissão e do cadastro; aqui só espera o resultado para mostrar no convite.
      for (let i = 0; i < 40 && toggle.disabled; i++) await new Promise(r => setTimeout(r, 250));
      await new Promise(r => setTimeout(r, 100));
      if (localStorage.getItem('acaiDailyPush') === '1') { box.innerHTML = '<p><strong>✅ Pronto!</strong> Você vai receber nossas promoções.</p>'; setTimeout(() => box.remove(), 4000); }
      else { btn.disabled = false; msg.textContent = $('#daily-push-message')?.textContent || 'Não foi possível ativar agora.'; msg.classList.add('error-message'); }
    });
  }).catch(() => { });
})();
