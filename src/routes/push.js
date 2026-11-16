import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAdmin, optionalCustomerId } from '../middleware/auth.js';
import { createAttemptLimiter } from '../services/rateLimit.js';
import { getSettings } from '../services/store.js';
import { localDateKey } from '../services/pushSchedule.js';
import { pickDailyMessage } from '../services/dailyMessages.js';
import { normalizeSubscription, pushConfigured, sendToSubscriptions } from '../services/push.js';
const router = Router();
// Cadastro de aparelhos: 30 por IP a cada hora (uso normal é 1 ou 2).
const subscribeByIp = createAttemptLimiter({ max: 30, windowMs: 60 * 60 * 1000 });
const adminRow = admin => ({ role: 'admin', adminId: admin.adminId });
function limited(req, res) {
  const wait = subscribeByIp.retryAfterSeconds(String(req.ip || 'unknown'));
  if (wait > 0) {
    res.set('Retry-After', String(wait));
    res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    return true;
  }
  subscribeByIp.record(String(req.ip || 'unknown'));
  return false;
}
// Um aparelho (endpoint) pode ter uma linha de cliente E uma de administrador: o dono da loja pode abrir o painel e o site no mesmo celular.
async function saveSubscription(db, sub, { role, adminId = null, customerId = null, userAgent = '' }) {
  await db.query(`INSERT INTO push_subscriptions(endpoint,p256dh,auth,role,admin_id,customer_id,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(endpoint,role) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, admin_id=EXCLUDED.admin_id, customer_id=EXCLUDED.customer_id, user_agent=EXCLUDED.user_agent, updated_at=NOW()`,
  [sub.endpoint, sub.p256dh, sub.auth, role, adminId, customerId, String(userAgent).slice(0, 300)]);
}
// A tela só mostra o botão de notificações se o servidor tiver as chaves VAPID configuradas.
router.get('/config', (_req, res) => {
  const enabled = pushConfigured();
  res.json({ enabled, publicKey: enabled ? process.env.VAPID_PUBLIC_KEY : null });
});
// ===== Cliente (visitante ou conta) =====
router.post('/customer/subscribe', async (req, res, next) => {
  try {
    if (!pushConfigured())
      return res.status(503).json({ error: 'Lembretes indisponíveis no momento.' });
    if (limited(req, res))
      return;
    const sub = normalizeSubscription(req.body.subscription);
    if (!sub)
      return res.status(400).json({ error: 'Não foi possível registrar este aparelho para notificações.' });
    // Com login, o aparelho fica ligado à conta (usado para não lembrar de pedir quem já pediu hoje e para chamar pelo nome).
    await saveSubscription(getPool(), sub, { role: 'customer', customerId: optionalCustomerId(req), userAgent: req.get('user-agent') });
    res.status(201).json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
router.post('/customer/unsubscribe', async (req, res, next) => {
  try {
    const endpoint = String(req.body.endpoint || '');
    if (endpoint && endpoint.length <= 1000)
      await getPool().query("DELETE FROM push_subscriptions WHERE endpoint=$1 AND role='customer'", [endpoint]);
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
// ===== Administrador =====
router.post('/admin/subscribe', requireAdmin, async (req, res, next) => {
  try {
    if (!pushConfigured())
      return res.status(503).json({ error: 'As chaves de notificação (VAPID) ainda não foram configuradas no servidor.' });
    if (limited(req, res))
      return;
    const sub = normalizeSubscription(req.body.subscription);
    if (!sub)
      return res.status(400).json({ error: 'Não foi possível registrar este aparelho para notificações.' });
    const db = getPool();
    await saveSubscription(db, sub, { ...adminRow(req.admin), userAgent: req.get('user-agent') });
    // Confirmação na hora: se o aviso chegar, o caminho todo (navegador, serviço de push, servidor) está funcionando.
    const test = await sendToSubscriptions(db, [{ id: 0, ...sub }], () => ({ title: '✅ Avisos de pedidos ligados', body: 'Você vai receber uma notificação aqui sempre que chegar um pedido.', url: '/admin', tag: 'avisos-ligados', kind: 'test' }));
    res.status(201).json({ ok: true, testSent: test.sent > 0 });
  }
  catch (e) {
    next(e);
  }
});
router.post('/admin/unsubscribe', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = String(req.body.endpoint || '');
    if (endpoint && endpoint.length <= 1000)
      await getPool().query("DELETE FROM push_subscriptions WHERE endpoint=$1 AND role='admin'", [endpoint]);
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
// Situação para o painel: este aparelho está recebendo avisos? Quantos clientes recebem o lembrete diário?
router.post('/admin/status', requireAdmin, async (req, res, next) => {
  try {
    const endpoint = String(req.body.endpoint || ''), db = getPool();
    const [mine, customers] = await Promise.all([
      endpoint && endpoint.length <= 1000 ? db.query("SELECT 1 FROM push_subscriptions WHERE endpoint=$1 AND role='admin'", [endpoint]) : { rowCount: 0 },
      db.query("SELECT COUNT(*)::int AS total FROM push_subscriptions WHERE role='customer'")
    ]);
    res.json({ subscribed: mine.rowCount > 0, customers: customers.rows[0].total });
  }
  catch (e) {
    next(e);
  }
});
// Mostra para o dono, no celular dele, exatamente o tipo de mensagem que os clientes recebem (a de hoje).
router.post('/admin/preview', requireAdmin, async (req, res, next) => {
  try {
    const db = getPool();
    const { rows } = await db.query("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE role='admin' AND admin_id=$1", [req.admin.adminId]);
    if (!rows.length)
      return res.status(409).json({ error: 'Ative “Avisos no celular” neste aparelho antes de enviar a prévia.' });
    const settings = await getSettings(), message = pickDailyMessage({ dateKey: localDateKey(), name: 'Maria', settings });
    const result = await sendToSubscriptions(db, rows, () => ({ ...message, tag: 'acai-previa' }));
    res.json({ ok: true, sent: result.sent, title: message.title, body: message.body });
  }
  catch (e) {
    next(e);
  }
});
export default router;
