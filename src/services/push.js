import { money } from './time.js';
import { firstName, pickDailyMessage } from './dailyMessages.js';

// Web Push (notificações no celular/computador, mesmo com o site fechado).
// Este arquivo não importa banco nem Express: recebe `db` e `settings` por parâmetro, o que permite testar com dados de mentira.
// Sem VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY o recurso fica desligado e nada mais no site muda.

const SEND_CHUNK = 10;
const SEND_TIMEOUT_MS = 10000;

// O servidor faz uma requisição POST para o "endpoint" que o navegador informa. Se aceitássemos qualquer endereço,
// um visitante mal-intencionado poderia usar o servidor para atingir outros sites (SSRF). Só aceitamos os serviços de push dos navegadores.
export function isAllowedPushEndpoint(value) {
  let url;
  try {
    url = new URL(String(value));
  }
  catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    return false;
  const host = url.hostname.toLowerCase();
  return host === 'fcm.googleapis.com'                       // Chrome, Edge, Opera, Brave, Samsung Internet (Android e desktop)
    || host === 'updates.push.services.mozilla.com'          // Firefox
    || host === 'push.apple.com' || host.endsWith('.push.apple.com')  // Safari / iOS (app instalado)
    || host.endsWith('.notify.windows.com');                 // Edge/Windows (WNS)
}

// Confere o objeto que o navegador devolve em subscription.toJSON() e devolve só o que guardamos, ou null se algo estiver errado.
export function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object')
    return null;
  const endpoint = String(raw.endpoint || ''), p256dh = String(raw.keys?.p256dh || ''), auth = String(raw.keys?.auth || '');
  if (endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint))
    return null;
  // Chave pública P-256 (65 bytes) e segredo de autenticação (16 bytes), em base64 "seguro para URL".
  if (!/^[A-Za-z0-9_-]{80,90}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,24}$/.test(auth))
    return null;
  return { endpoint, p256dh, auth };
}

export const pushConfigured = (env = process.env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

// O assunto (subject) do VAPID precisa ser um mailto: ou um https:. Se não for definido, usa o e-mail do administrador.
export function vapidSubject(env = process.env) {
  if (env.VAPID_SUBJECT)
    return env.VAPID_SUBJECT;
  if (/^https:\/\//.test(env.SITE_URL || ''))
    return env.SITE_URL;
  return `mailto:${env.ADMIN_EMAIL || 'contato@example.com'}`;
}

let senderOverride = null, webPush = null;
// Só para testes: troca o envio real por uma função de mentira. Chame sem argumento para voltar ao normal.
export function setPushSender(fn = null) { senderOverride = fn; }
async function getSender(env = process.env) {
  if (senderOverride)
    return senderOverride;
  if (!pushConfigured(env))
    return null;
  if (!webPush) {
    const mod = await import('web-push');
    webPush = mod.default || mod;
    webPush.setVapidDetails(vapidSubject(env), env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  }
  return (subscription, body, options) => webPush.sendNotification(subscription, body, options);
}

// Envia para uma lista de assinaturas (linhas de push_subscriptions). Assinatura que o serviço de push diz que não existe
// mais (404/410: o usuário limpou o navegador ou desinstalou o app) é apagada do banco. Nunca lança erro por causa de uma assinatura.
export async function sendToSubscriptions(db, rows, buildPayload, { ttl = 3600, urgency = 'normal' } = {}) {
  const send = await getSender();
  const summary = { sent: 0, failed: 0, removed: 0 };
  if (!send || !rows.length)
    return { ...summary, skipped: !send };
  const dead = [];
  for (let i = 0; i < rows.length; i += SEND_CHUNK) {
    await Promise.all(rows.slice(i, i + SEND_CHUNK).map(async row => {
      try {
        await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(buildPayload(row)), { TTL: ttl, urgency, timeout: SEND_TIMEOUT_MS });
        summary.sent++;
      }
      catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410)
          dead.push(row.id);
        else {
          summary.failed++;
          // Sem o endpoint no log: ele funciona como um endereço secreto do aparelho.
          console.error('Falha ao enviar push:', err?.statusCode || '', String(err?.message || err).slice(0, 160));
        }
      }
    }));
  }
  if (dead.length) {
    summary.removed = dead.length;
    await db.query('DELETE FROM push_subscriptions WHERE id = ANY($1::bigint[])', [dead]);
  }
  return summary;
}

// ===== Aviso de novo pedido para o administrador =====
export function buildNewOrderPayload({ orderCode, customerName, itemCount, totalCents, fulfillment, neighborhood, paymentMethod, scheduledFor }) {
  const items = Number(itemCount) || 0;
  const how = fulfillment === 'quick' ? '⚡ Pedido rápido (na loja)' : fulfillment === 'pickup' ? 'Retirada' : `Entrega: ${neighborhood}`;
  const parts = [firstName(customerName) || String(customerName || 'Cliente').split(/\s+/)[0], `${items} ${items === 1 ? 'item' : 'itens'}`, money(totalCents), how, paymentMethod];
  if (scheduledFor) {
    const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduledFor));
    parts.unshift(`Agendado para ${when}`);
  }
  // O endereço e o telefone ficam só no painel: a notificação aparece na tela bloqueada do aparelho.
  return { title: `🍇 Novo pedido ${orderCode}`, body: parts.join(' · '), url: '/admin', tag: `pedido-${orderCode}`, kind: 'order', requireInteraction: true };
}

export async function notifyAdminsNewOrder(db, order) {
  const { rows } = await db.query("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE role='admin'");
  if (!rows.length)
    return { sent: 0, failed: 0, removed: 0 };
  const payload = buildNewOrderPayload(order);
  // urgency 'high' pede ao serviço de push para entregar na hora, sem esperar o aparelho "acordar" em lote. TTL de 2 h: pedido velho não interessa.
  return sendToSubscriptions(db, rows, () => payload, { ttl: 7200, urgency: 'high' });
}

// ===== Lembrete diário para clientes =====
// Chamado pelo agendador já com a decisão "é hora de enviar" tomada (planDailyPush). Escolhe, em uma única consulta atômica,
// quem recebe hoje e já marca o dia como enviado: mesmo que duas instâncias rodem juntas ou o serviço reinicie no meio, ninguém recebe duas vezes.
// Quem já fez pedido hoje (conta logada) não recebe: seria irritante ser convidado a pedir de novo.
export async function runDailyPush(db, { settings, dateKey }) {
  const claimed = await db.query(`
    WITH due AS (
      SELECT ps.id FROM push_subscriptions ps
      WHERE ps.role = 'customer'
        AND (ps.last_daily_date IS NULL OR ps.last_daily_date < $1::date)
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.customer_id = ps.customer_id AND o.status <> 'cancelled'
            AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date = $1::date)
      FOR UPDATE OF ps SKIP LOCKED
    )
    UPDATE push_subscriptions ps SET last_daily_date = $1::date
    FROM due WHERE ps.id = due.id
    RETURNING ps.id, ps.endpoint, ps.p256dh, ps.auth, (SELECT c.name FROM customers c WHERE c.id = ps.customer_id) AS name`, [dateKey]);
  if (!claimed.rows.length)
    return { claimed: 0, sent: 0, failed: 0, removed: 0 };
  const result = await sendToSubscriptions(db, claimed.rows, row => pickDailyMessage({ dateKey, name: row.name, settings }), { ttl: 6 * 3600 });
  return { claimed: claimed.rows.length, ...result };
}
