import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewOrderPayload, isAllowedPushEndpoint, normalizeSubscription, notifyAdminsNewOrder, pushConfigured, runDailyPush, sendToSubscriptions, setPushSender, vapidSubject } from './push.js';

afterEach(() => setPushSender(null));
const P256 = 'B'.repeat(87), AUTH = 'a'.repeat(22);
const goodSub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: P256, auth: AUTH } };
// Banco de mentira: guarda as consultas e responde conforme o texto do SQL.
function fakeDb(handlers = {}) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); for (const [needle, reply] of Object.entries(handlers)) if (sql.includes(needle)) return typeof reply === 'function' ? reply(params) : reply; return { rows: [], rowCount: 0 }; } };
}

test('só aceita endpoints dos serviços de push dos navegadores (proteção contra SSRF)', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/?token=x'])
    assert.equal(isAllowedPushEndpoint(ok), true, ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evilfcm.googleapis.com.attacker.net/', 'https://push.apple.com.evil.com/', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'https://localhost/x', 'file:///etc/passwd', 'não é url', '', null, undefined])
    assert.equal(isAllowedPushEndpoint(bad), false, String(bad));
  assert.equal(isAllowedPushEndpoint('https://notpush.apple.com.evil.org/'), false);
  assert.equal(isAllowedPushEndpoint('https://evil-push.apple.com/'), false); // parece, mas não é subdomínio de push.apple.com
});
test('normalizeSubscription devolve só endpoint, p256dh e auth, e recusa o que estiver fora do padrão', () => {
  assert.deepEqual(normalizeSubscription({ ...goodSub, extra: 'x' }), { endpoint: goodSub.endpoint, p256dh: P256, auth: AUTH });
  assert.equal(normalizeSubscription(null), null);
  assert.equal(normalizeSubscription('x'), null);
  assert.equal(normalizeSubscription({ endpoint: goodSub.endpoint }), null);
  assert.equal(normalizeSubscription({ ...goodSub, keys: { p256dh: 'curta', auth: AUTH } }), null);
  assert.equal(normalizeSubscription({ ...goodSub, keys: { p256dh: P256, auth: 'x'.repeat(40) } }), null);
  assert.equal(normalizeSubscription({ ...goodSub, keys: { p256dh: P256 + '!', auth: AUTH } }), null);
  assert.equal(normalizeSubscription({ ...goodSub, endpoint: 'https://fcm.googleapis.com/' + 'a'.repeat(1100) }), null);
  assert.equal(normalizeSubscription({ ...goodSub, endpoint: 'https://evil.com/x' }), null);
});
test('pushConfigured e vapidSubject', () => {
  assert.equal(pushConfigured({}), false);
  assert.equal(pushConfigured({ VAPID_PUBLIC_KEY: 'a' }), false);
  assert.equal(pushConfigured({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' }), true);
  assert.equal(vapidSubject({ VAPID_SUBJECT: 'mailto:a@b.com', ADMIN_EMAIL: 'x@y.com' }), 'mailto:a@b.com');
  assert.equal(vapidSubject({ SITE_URL: 'https://loja.com.br', ADMIN_EMAIL: 'x@y.com' }), 'https://loja.com.br');
  assert.equal(vapidSubject({ SITE_URL: 'http://localhost:3000', ADMIN_EMAIL: 'x@y.com' }), 'mailto:x@y.com');
});
test('o aviso de pedido traz resumo útil, mas nunca telefone nem endereço', () => {
  const p = buildNewOrderPayload({ orderCode: 'AR-K7M2PQ', customerName: 'maria da silva', itemCount: 2, totalCents: 3850, fulfillment: 'delivery', neighborhood: 'Cruzeiro', paymentMethod: 'Pix', scheduledFor: null });
  assert.equal(p.title, '🍇 Novo pedido AR-K7M2PQ');
  assert.match(p.body, /^Maria · 2 itens · R\$\s38,50 · Entrega: Cruzeiro · Pix$/);
  assert.equal(p.url, '/admin');
  assert.equal(p.tag, 'pedido-AR-K7M2PQ');
  assert.equal(p.requireInteraction, true);
  const one = buildNewOrderPayload({ orderCode: 'AR-AAAAAA', customerName: 'Zé', itemCount: 1, totalCents: 1200, fulfillment: 'pickup', neighborhood: 'Retirada', paymentMethod: 'Dinheiro', scheduledFor: '2026-11-15T21:30:00Z' });
  assert.match(one.body, /^Agendado para 15\/11,? 18:30 · Zé · 1 item · R\$\s12,00 · Retirada · Dinheiro$/);
});
test('sendToSubscriptions: conta enviados, remove assinatura morta (404/410) e segue o jogo nas outras falhas', async () => {
  const rows = [1, 2, 3, 4].map(id => ({ id, endpoint: `https://fcm.googleapis.com/${id}`, p256dh: P256, auth: AUTH }));
  const sent = [];
  setPushSender(async (sub, body, opts) => {
    const id = Number(sub.endpoint.split('/').pop());
    if (id === 2) throw Object.assign(new Error('gone'), { statusCode: 410 });
    if (id === 3) throw Object.assign(new Error('boom'), { statusCode: 500 });
    sent.push({ id, body: JSON.parse(body), opts });
    return {};
  });
  const db = fakeDb();
  const quiet = console.error; console.error = () => {};
  const r = await sendToSubscriptions(db, rows, row => ({ title: `p${row.id}` }), { ttl: 60, urgency: 'high' });
  console.error = quiet;
  assert.deepEqual(r, { sent: 2, failed: 1, removed: 1 });
  assert.deepEqual(sent.map(s => s.body.title).sort(), ['p1', 'p4']);
  assert.equal(sent[0].opts.TTL, 60);
  assert.equal(sent[0].opts.urgency, 'high');
  const del = db.calls.find(c => c.sql.startsWith('DELETE'));
  assert.deepEqual(del.params, [[2]]);
});
test('sendToSubscriptions sem chaves VAPID não faz nada e não quebra', async () => {
  const r = await sendToSubscriptions(fakeDb(), [{ id: 1, endpoint: 'x', p256dh: 'x', auth: 'x' }], () => ({}));
  assert.equal(r.sent, 0);
  assert.equal(r.skipped, true);
});
test('sendToSubscriptions envia em lotes sem perder nenhum aparelho', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, endpoint: `https://fcm.googleapis.com/${i}`, p256dh: P256, auth: AUTH }));
  let n = 0;
  setPushSender(async () => { n++; });
  const r = await sendToSubscriptions(fakeDb(), rows, () => ({}));
  assert.equal(n, 25);
  assert.equal(r.sent, 25);
});
test('notifyAdminsNewOrder envia o resumo do pedido a todos os aparelhos de administrador', async () => {
  const bodies = [];
  setPushSender(async (_s, body) => { bodies.push(JSON.parse(body)); });
  const db = fakeDb({ "role='admin'": { rows: [{ id: 1, endpoint: 'https://fcm.googleapis.com/a', p256dh: P256, auth: AUTH }, { id: 2, endpoint: 'https://fcm.googleapis.com/b', p256dh: P256, auth: AUTH }] } });
  const r = await notifyAdminsNewOrder(db, { orderCode: 'AR-ZZZZZZ', customerName: 'Ana', itemCount: 3, totalCents: 5000, fulfillment: 'delivery', neighborhood: 'Andradas', paymentMethod: 'Pix' });
  assert.equal(r.sent, 2);
  assert.equal(bodies.length, 2);
  assert.match(bodies[0].title, /AR-ZZZZZZ/);
});
test('notifyAdminsNewOrder sem nenhum administrador cadastrado não tenta enviar', async () => {
  let called = false;
  setPushSender(async () => { called = true; });
  const r = await notifyAdminsNewOrder(fakeDb(), { orderCode: 'AR-X', customerName: 'Ana', itemCount: 1, totalCents: 100, fulfillment: 'pickup', neighborhood: 'Retirada', paymentMethod: 'Pix' });
  assert.equal(r.sent, 0);
  assert.equal(called, false);
});
test('runDailyPush reivindica os clientes do dia no banco e personaliza pelo nome', async () => {
  const sent = [];
  setPushSender(async (sub, body) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) }); });
  const db = fakeDb({ 'UPDATE push_subscriptions': { rows: [
    { id: 1, endpoint: 'https://fcm.googleapis.com/a', p256dh: P256, auth: AUTH, name: 'Ana Souza' },
    { id: 2, endpoint: 'https://fcm.googleapis.com/b', p256dh: P256, auth: AUTH, name: null }
  ] } });
  const r = await runDailyPush(db, { settings: {}, dateKey: '2026-11-15' });
  assert.deepEqual(r, { claimed: 2, sent: 2, failed: 0, removed: 0 });
  const q = db.calls[0];
  assert.deepEqual(q.params, ['2026-11-15']);
  // A consulta precisa excluir quem já recebeu hoje, quem já pediu hoje e travar linhas para duas instâncias não duplicarem.
  assert.match(q.sql, /last_daily_date IS NULL OR ps\.last_daily_date < \$1::date/);
  assert.match(q.sql, /NOT EXISTS[\s\S]*orders[\s\S]*status <> 'cancelled'/);
  assert.match(q.sql, /FOR UPDATE OF ps SKIP LOCKED/);
  assert.match(q.sql, /role = 'customer'/);
  assert.ok(sent.every(s => s.kind === 'daily' && s.url === '/#cardapio'));
  assert.ok(!sent[1].title.includes('{nome}'));
});
test('runDailyPush sem ninguém para avisar não envia nada', async () => {
  let called = false;
  setPushSender(async () => { called = true; });
  const r = await runDailyPush(fakeDb(), { settings: {}, dateKey: '2026-11-15' });
  assert.deepEqual(r, { claimed: 0, sent: 0, failed: 0, removed: 0 });
  assert.equal(called, false);
});
