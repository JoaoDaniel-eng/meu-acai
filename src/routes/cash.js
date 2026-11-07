import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { cashDifference, MOVEMENT_KINDS, parseCents, summarizeCash } from '../services/cash.js';
// Abertura e fechamento de caixa. Montado dentro do painel (/api/admin/cash): já exige login e entra na auditoria.
const router = Router();
const setOrdersPaused = (db, paused) => db.query("INSERT INTO settings(key,value,updated_at) VALUES('manual_closed',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()", [String(paused)]);
// Pedidos do período (sem cancelados) por forma de pagamento. Vale a data combinada de entrega; se for imediato, a do pedido.
async function salesBetween(db, from, to) {
  const { rows } = await db.query("SELECT COALESCE(payment_method,'A combinar') AS payment_method,COUNT(*)::int AS orders,COALESCE(SUM(total_cents),0)::int AS total_cents FROM orders WHERE status<>'cancelled' AND COALESCE(scheduled_for,created_at)>=$1 AND COALESCE(scheduled_for,created_at)<=$2 GROUP BY 1", [from, to]);
  return rows;
}
async function buildReport(db, session) {
  const movements = (await db.query('SELECT id,kind,amount_cents,reason,created_by,created_at FROM cash_movements WHERE session_id=$1 ORDER BY created_at,id', [session.id])).rows;
  const summary = session.closed_at && session.summary ? session.summary : summarizeCash({ openingCents: session.opening_cents, salesRows: await salesBetween(db, session.opened_at, new Date()), movements });
  return { session, movements, summary };
}
router.get('/current', async (_req, res, next) => {
  try {
    const db = getPool(), { rows } = await db.query('SELECT * FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    res.json(rows[0] ? await buildReport(db, rows[0]) : { session: null });
  }
  catch (e) {
    next(e);
  }
});
router.post('/open', async (req, res, next) => {
  try {
    const opening = parseCents(req.body?.openingCents);
    if (opening === null)
      return res.status(400).json({ error: 'Informe o troco inicial (pode ser R$ 0,00).' });
    const db = getPool();
    let created;
    try {
      created = await db.query('INSERT INTO cash_sessions(opened_by,opening_cents,open_notes) VALUES($1,$2,$3) RETURNING *', [req.admin.email, opening, String(req.body?.notes || '').trim().slice(0, 500)]);
    }
    catch (e) {
      if (e.code === '23505')
        return res.status(409).json({ error: 'Já existe um caixa aberto. Feche-o antes de abrir outro.' });
      throw e;
    }
    if (req.body?.resumeOrders === true)
      await setOrdersPaused(db, false);
    res.status(201).json(await buildReport(db, created.rows[0]));
  }
  catch (e) {
    next(e);
  }
});
router.post('/movements', async (req, res, next) => {
  try {
    const kind = String(req.body?.kind || ''), amount = parseCents(req.body?.amountCents, { allowZero: false }), reason = String(req.body?.reason || '').trim().slice(0, 200);
    if (!MOVEMENT_KINDS[kind])
      return res.status(400).json({ error: 'Escolha o tipo do lançamento.' });
    if (amount === null)
      return res.status(400).json({ error: 'Informe um valor maior que zero.' });
    if (reason.length < 3)
      return res.status(400).json({ error: 'Explique o motivo do lançamento (mínimo de 3 letras).' });
    const db = getPool(), open = await db.query('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!open.rowCount)
      return res.status(409).json({ error: 'O caixa está fechado. Abra o caixa para lançar movimentos.' });
    const r = await db.query('INSERT INTO cash_movements(session_id,kind,amount_cents,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id', [open.rows[0].id, kind, amount, reason, req.admin.email]);
    res.status(201).json({ id: r.rows[0].id });
  }
  catch (e) {
    next(e);
  }
});
// Só dá para desfazer um lançamento enquanto o caixa dele está aberto.
router.delete('/movements/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(400).json({ error: 'Lançamento inválido.' });
    const r = await getPool().query('DELETE FROM cash_movements m USING cash_sessions s WHERE m.id=$1 AND s.id=m.session_id AND s.closed_at IS NULL', [id]);
    if (!r.rowCount)
      return res.status(404).json({ error: 'Lançamento não encontrado ou o caixa dele já foi fechado.' });
    res.json({ ok: true });
  }
  catch (e) {
    next(e);
  }
});
router.post('/close', async (req, res, next) => {
  const counted = parseCents(req.body?.countedCents);
  if (counted === null)
    return res.status(400).json({ error: 'Informe quanto dinheiro você contou no caixa.' });
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const open = await client.query('SELECT * FROM cash_sessions WHERE closed_at IS NULL FOR UPDATE');
    if (!open.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Não há caixa aberto.' });
    }
    const session = open.rows[0], now = new Date();
    const movements = (await client.query('SELECT kind,amount_cents FROM cash_movements WHERE session_id=$1', [session.id])).rows;
    const summary = summarizeCash({ openingCents: session.opening_cents, salesRows: await salesBetween(client, session.opened_at, now), movements });
    const difference = cashDifference(counted, summary.expectedCashCents);
    const notes = String(req.body?.notes || '').trim().slice(0, 500);
    await client.query('UPDATE cash_sessions SET closed_at=$2,closed_by=$3,counted_cents=$4,expected_cents=$5,difference_cents=$6,close_notes=$7,summary=$8 WHERE id=$1', [session.id, now, req.admin.email, counted, summary.expectedCashCents, difference, notes, JSON.stringify(summary)]);
    if (req.body?.pauseOrders === true)
      await setOrdersPaused(client, true);
    await client.query('COMMIT');
    const db = getPool(), closed = (await db.query('SELECT * FROM cash_sessions WHERE id=$1', [session.id])).rows[0];
    res.json(await buildReport(db, closed));
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    next(e);
  }
  finally {
    client.release();
  }
});
router.get('/history', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit)) || 30));
    const { rows } = await getPool().query('SELECT id,opened_at,opened_by,opening_cents,closed_at,closed_by,counted_cents,expected_cents,difference_cents FROM cash_sessions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT $1', [limit]);
    res.json(rows);
  }
  catch (e) {
    next(e);
  }
});
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      return res.status(400).json({ error: 'Caixa inválido.' });
    const db = getPool(), { rows } = await db.query('SELECT * FROM cash_sessions WHERE id=$1', [id]);
    if (!rows.length)
      return res.status(404).json({ error: 'Caixa não encontrado.' });
    res.json(await buildReport(db, rows[0]));
  }
  catch (e) {
    next(e);
  }
});
export default router;
