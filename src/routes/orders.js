import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { getSettings, isOpenAt } from '../services/store.js';
import { assertWithinOrderLimit, buildOrderItem, comboRules, priceOrder, summarizeItems } from '../services/pricing.js';
import { createAttemptLimiter } from '../services/rateLimit.js';
import { findStockShortage } from '../services/inventory.js';
import { buildOrderPix } from '../services/pix.js';
import { makeOrderCode, ORDER_CODE_PATTERN } from '../services/orderCode.js';
const router = Router();
// Anti-spam de pedidos: no máximo 20 pedidos por IP e 6 por telefone a cada hora (só pedidos criados contam).
const ordersByIp = createAttemptLimiter({ max: 20, windowMs: 60 * 60 * 1000 }), ordersByPhone = createAttemptLimiter({ max: 6, windowMs: 60 * 60 * 1000 });
import jwt from 'jsonwebtoken';
function optionalCustomerId(req) {
  try {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const p = jwt.verify(raw, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return p.type === 'customer' ? Number(p.sub) : null;
  }
  catch {
    return null;
  }
}
// Só o pedido ainda "Recebido" (new) pode ser editado/cancelado pelo cliente. Depois que a loja começa o preparo,
// o estoque já foi baixado e o açaí está sendo feito: mudanças passam a ser combinadas pelo WhatsApp.
const EDITABLE_STATUSES = ['new'];
// Proteção contra adivinhação de código/telefone no acompanhamento, edição e cancelamento.
// Só tentativas que FALHAM contam (pedido inexistente / telefone errado), então o uso normal nunca é bloqueado:
// 30 falhas por IP e 8 por código de pedido a cada 15 minutos.
const lookupByIp = createAttemptLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), lookupByCode = createAttemptLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
function lookupGuard(req, res, code) {
  const wait = Math.max(lookupByIp.retryAfterSeconds(String(req.ip || 'unknown')), code ? lookupByCode.retryAfterSeconds(code) : 0);
  if (wait > 0) {
    res.set('Retry-After', String(wait));
    res.status(429).json({ error: `Muitas tentativas. Aguarde ${Math.ceil(wait / 60)} minuto(s) e tente novamente, ou fale com a loja pelo WhatsApp.` });
    return false;
  }
  return true;
}
function lookupFail(req, code) {
  lookupByIp.record(String(req.ip || 'unknown'));
  if (code)
    lookupByCode.record(code);
}
router.post('/orders', async (req, res, next) => {
  try {
    const { customerName, phone, address, zoneId, notes = '', scheduledFor = null, paymentMethod, needsChange = 'no', changeFor = '', couponCode = '', items } = req.body || {};
    const name = String(customerName || '').trim(), customerPhone = String(phone || '').trim(), addr = String(address || '').trim();
    const ipKey = String(req.ip || 'unknown'), phoneKey = customerPhone.replace(/\D/g, '');
    const wait = Math.max(ordersByIp.retryAfterSeconds(ipKey), phoneKey ? ordersByPhone.retryAfterSeconds(phoneKey) : 0);
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos ou fale com a loja pelo WhatsApp.' });
    }
    if (name.length < 2 || name.length > 120 || customerPhone.replace(/\D/g, '').length < 10 || customerPhone.replace(/\D/g, '').length > 15 || addr.length < 6 || !['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito'].includes(paymentMethod) || !Array.isArray(items) || items.length < 1 || items.length > 30)
      return res.status(400).json({ error: 'Confira nome, telefone, endereço, pagamento e itens do pedido.' });
    const cashChangeFor = paymentMethod === 'Dinheiro' && needsChange === 'yes' ? String(changeFor).trim() : null;
    if (paymentMethod === 'Dinheiro' && !['yes', 'no'].includes(needsChange))
      return res.status(400).json({ error: 'Informe se precisa de troco. Essa informação é obrigatória para pagamento em dinheiro.' });
    if (paymentMethod === 'Dinheiro' && needsChange === 'yes' && (!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(cashChangeFor) || Number(cashChangeFor.replace(',', '.')) <= 0))
      return res.status(400).json({ error: 'Informe um valor válido para o troco.' });
    const db = getPool(), settings = await getSettings();
    const accountId = optionalCustomerId(req);
    if (accountId) {
      const account = await db.query('SELECT phone FROM customers WHERE id=$1', [accountId]);
      if (!account.rowCount || account.rows[0].phone !== customerPhone.replace(/\D/g, ''))
        return res.status(400).json({ error: 'O telefone do pedido precisa ser o mesmo da sua conta.' });
    }
    if (!Number.isInteger(Number(zoneId)) || Number(zoneId) < 1)
      return res.status(400).json({ error: 'Selecione um bairro válido.' });
    const zoneResult = await db.query('SELECT id,name,fee_cents FROM delivery_zones WHERE id=$1 AND active=true', [Number(zoneId)]);
    if (!zoneResult.rowCount)
      return res.status(400).json({ error: 'Bairro não atendido no momento. Escolha uma opção disponível.' });
    const zone = zoneResult.rows[0];
    let schedule = null;
    if (scheduledFor) {
      schedule = new Date(scheduledFor);
      if (Number.isNaN(schedule.getTime()))
        return res.status(400).json({ error: 'Data de agendamento inválida.' });
      const minMinutes = Number(settings.minimum_schedule_minutes || 30);
      if (schedule.getTime() < Date.now() + minMinutes * 60000)
        return res.status(400).json({ error: `Agende com pelo menos ${minMinutes} minutos de antecedência.` });
      if (!isOpenAt(schedule, settings))
        return res.status(400).json({ error: `O horário agendado precisa estar dentro do funcionamento (${settings.openingTime || '13:30'} às ${settings.closingTime || '22:00'}, de terça a domingo).` });
    }
    else if (settings.manual_closed === 'true' || !isOpenAt(new Date(), settings))
      return res.status(409).json({ error: 'A loja está fechada para pedidos imediatos. Você pode agendar para outro horário.' });
    if (!items.every(item => item && typeof item === 'object' && !Array.isArray(item)))
      return res.status(400).json({ error: 'Formato de item inválido.' });
    const sizeIds = [...new Set(items.map(i => Number(i.sizeId)))];
    if (sizeIds.some(id => !Number.isInteger(id) || id < 1) || items.some(item => Array.isArray(item.optionIds) && item.optionIds.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) || items.some(item => item.optionIds !== undefined && !Array.isArray(item.optionIds)))
      return res.status(400).json({ error: 'Tamanho ou adicional inválido.' });
    const sizes = (await db.query('SELECT s.id,s.name,s.price_cents,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id WHERE s.id=ANY($1::int[]) AND s.active=true AND p.active=true', [sizeIds])).rows;
    if (sizes.length !== sizeIds.length)
      return res.status(400).json({ error: 'Um dos tamanhos escolhidos não está disponível.' });
    const optionIds = [...new Set(items.flatMap(i => Array.isArray(i.optionIds) ? i.optionIds.map(Number) : []))];
    const options = optionIds.length ? (await db.query('SELECT id,name,category,price_cents FROM options WHERE id=ANY($1::int[]) AND active=true', [optionIds])).rows : [];
    if (options.length !== optionIds.length)
      return res.status(400).json({ error: 'Um dos adicionais não está disponível.' });
    const optionMap = new Map(options.map(o => [o.id, o]));
    const maxToppings = Number(settings.max_free_toppings || 5);
    const normalized = [];
    for (const item of items) {
      const size = sizes.find(s => s.id === Number(item.sizeId));
      const qty = Number(item.quantity);
      const ids = Array.isArray(item.optionIds) ? [...new Set(item.optionIds.map(Number))] : [];
      if (!Number.isInteger(qty) || qty < 1 || qty > 20 || ids.length > 30)
        return res.status(400).json({ error: 'Quantidade inválida (1 a 20 por item).' });
      normalized.push(buildOrderItem({ size, options: ids.map(id => optionMap.get(id)), quantity: qty, maxToppings }));
    }
    const { subtotalCents: subtotal, itemCount } = summarizeItems(normalized);
    // Estoque: se o ingrediente cadastrado por tamanho (ex.: açaí) não cobre o pedido inteiro, não aceita. A baixa só ocorre em "Preparando".
    const stockRows = (await db.query('SELECT r.inventory_item_id,r.size_id,r.quantity,i.name,i.quantity AS stock FROM inventory_recipes r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.size_id=ANY($1::int[]) AND i.active=true', [sizeIds])).rows;
    const shortage = findStockShortage(normalized.map(n => ({ sizeId: n.sizeId, quantity: n.quantity })), stockRows);
    if (shortage)
      return res.status(409).json({ error: `Não temos ${shortage.name} suficiente para este pedido. Escolha um tamanho menor, reduza a quantidade ou fale com a loja pelo WhatsApp.` });
    assertWithinOrderLimit(subtotal);
    const normalizedCoupon = String(couponCode || '').trim().toUpperCase();
    let couponRow = null;
    if (normalizedCoupon) {
      const c = await db.query('SELECT code,discount_type,discount_value,min_subtotal_cents FROM coupons WHERE code=$1 AND active=true', [normalizedCoupon]);
      if (!c.rowCount)
        return res.status(400).json({ error: 'Cupom inválido ou indisponível.' });
      couponRow = c.rows[0];
    }
    const pricing = priceOrder({ subtotalCents: subtotal, itemCount, deliveryFeeCents: zone.fee_cents, combo: comboRules(settings), coupon: couponRow });
    if (pricing.couponRejected)
      return res.status(400).json({ error: pricing.couponRejected.message });
    const { comboDiscountCents: comboDiscount, couponDiscountCents: discount, deliveryFeeCents: fee, totalCents: total } = pricing;
    const estimatedMin = Number(settings.estimated_minutes_min || 35), estimatedMax = Math.max(estimatedMin, Number(settings.estimated_minutes_max || 55));
    let orderCode;
    for (let i = 0; i < 5; i++) {
      orderCode = makeOrderCode();
      const exists = await db.query('SELECT 1 FROM orders WHERE order_code=$1', [orderCode]);
      if (!exists.rowCount)
        break;
    }
    const result = await db.query(`INSERT INTO orders(customer_id,order_code,customer_name,customer_phone,address,neighborhood,notes,scheduled_for,payment_method,change_for,coupon_code,discount_cents,combo_discount_cents,estimated_minutes_min,estimated_minutes_max,items,subtotal_cents,delivery_fee_cents,total_cents)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,order_code,created_at`, [accountId, orderCode, name, customerPhone, addr, zone.name, String(notes).trim().slice(0, 1000), schedule, paymentMethod, cashChangeFor, pricing.couponCode, discount, comboDiscount, estimatedMin, estimatedMax, JSON.stringify(normalized), subtotal, fee, total]);
    ordersByIp.record(ipKey);
    if (phoneKey)
      ordersByPhone.record(phoneKey);
    res.status(201).json({ id: result.rows[0].id, orderCode, createdAt: result.rows[0].created_at, customerName: name, phone: customerPhone, address: addr, neighborhood: zone.name, notes: String(notes).trim(), scheduledFor: schedule, paymentMethod, changeFor: cashChangeFor, items: normalized, subtotalCents: subtotal, discountCents: discount, comboDiscountCents: comboDiscount, couponCode: pricing.couponCode, estimatedMinutesMin: estimatedMin, estimatedMinutesMax: estimatedMax, deliveryFeeCents: fee, totalCents: total, whatsappNumber: String(settings.whatsapp_number || '').replace(/\D/g, ''), pix: paymentMethod === 'Pix' ? buildOrderPix(settings, { amountCents: total, orderCode }) : null });
  }
  catch (e) {
    next(e);
  }
});
// Consulta pública protegida por código do pedido + telefone cadastrado.
router.get('/orders/track', async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase(), phone = String(req.query.phone || '').replace(/\D/g, '');
    if (!lookupGuard(req, res, code))
      return;
    if (!ORDER_CODE_PATTERN.test(code) || phone.length < 10) {
      lookupFail(req, '');
      return res.status(400).json({ error: 'Informe o código do pedido e o telefone usado na compra.' });
    }
    const r = await getPool().query("SELECT order_code,customer_name,customer_phone,address,neighborhood,notes,scheduled_for,payment_method,change_for,coupon_code,discount_cents,combo_discount_cents,estimated_minutes_min,estimated_minutes_max,items,subtotal_cents,delivery_fee_cents,total_cents,status,created_at,updated_at FROM orders WHERE order_code=$1 AND regexp_replace(customer_phone,'[^0-9]','','g')=$2", [code, phone]);
    if (!r.rowCount) {
      lookupFail(req, code);
      return res.status(404).json({ error: 'Pedido não encontrado. Confira o código e o telefone.' });
    }
    const o = r.rows[0];
    const loyalty = await getPool().query("SELECT COALESCE(SUM(points),0)::int AS balance FROM loyalty_points WHERE regexp_replace(customer_phone,'[^0-9]','','g')=$1", [phone]);
    const earned = await getPool().query('SELECT points FROM loyalty_points WHERE order_id=(SELECT id FROM orders WHERE order_code=$1)', [code]);
    res.json({ orderCode: o.order_code, customerName: o.customer_name, phone: o.customer_phone, address: o.address, neighborhood: o.neighborhood, notes: o.notes, scheduledFor: o.scheduled_for, paymentMethod: o.payment_method, changeFor: o.change_for, items: o.items, subtotalCents: o.subtotal_cents, discountCents: o.discount_cents || 0, comboDiscountCents: o.combo_discount_cents || 0, estimatedMinutesMin: o.estimated_minutes_min || 35, estimatedMinutesMax: o.estimated_minutes_max || 55, loyaltyBalance: loyalty.rows[0].balance, earnedPoints: earned.rows[0]?.points || 0, couponCode: o.coupon_code, deliveryFeeCents: o.delivery_fee_cents, totalCents: o.total_cents, status: o.status, createdAt: o.created_at, updatedAt: o.updated_at, canEdit: EDITABLE_STATUSES.includes(o.status), canCancel: EDITABLE_STATUSES.includes(o.status) });
  }
  catch (e) {
    next(e);
  }
});
router.patch('/orders/:code/customer', async (req, res, next) => {
  let client = null;
  try {
    const code = String(req.params.code || '').toUpperCase(), phone = String(req.body.phone || '').replace(/\D/g, '');
    if (!lookupGuard(req, res, code))
      return;
    // Transação de verdade: o FOR UPDATE só trava a linha se estiver dentro de BEGIN...COMMIT.
    client = await getPool().connect();
    const db = client;
    await client.query('BEGIN');
    const found = await db.query("SELECT * FROM orders WHERE order_code=$1 AND regexp_replace(customer_phone, '[^0-9]', '', 'g')=$2 FOR UPDATE", [code, phone]);
    if (!found.rowCount) {
      lookupFail(req, code);
      return res.status(404).json({ error: 'Pedido não encontrado. Confira o código e o telefone.' });
    }
    const o = found.rows[0];
    if (!EDITABLE_STATUSES.includes(o.status))
      return res.status(409).json({ error: 'A loja já começou a preparar este pedido, então ele não pode mais ser editado pelo site. Fale com a loja pelo WhatsApp.' });
    const items = Array.isArray(req.body.items) ? req.body.items : null;
    if (!items || !items.length || items.length > 30)
      return res.status(400).json({ error: 'O pedido precisa ter pelo menos um item.' });
    const old = o.items;
    const normalized = [];
    if (!items.every(edit => edit && typeof edit === 'object' && !Array.isArray(edit)))
      return res.status(400).json({ error: 'Formato de item inválido.' });
    const requested = items.map(edit => ({ edit, idx: Number(edit.index), qty: Number(edit.quantity), sizeId: Number(edit.sizeId), optionIds: Array.isArray(edit.optionIds) ? [...new Set(edit.optionIds.map(Number))] : [] }));
    if (requested.some(x => x.edit.optionIds !== undefined && !Array.isArray(x.edit.optionIds)) || requested.some(x => x.optionIds.some(id => !Number.isInteger(id) || id < 1)) || new Set(requested.map(x => x.idx)).size !== requested.length)
      return res.status(400).json({ error: 'Itens ou adicionais inválidos.' });
    if (requested.some(x => !Number.isInteger(x.idx) || !old[x.idx] || !Number.isInteger(x.qty) || x.qty < 0 || x.qty > 20 || (x.qty > 0 && (!Number.isInteger(x.sizeId) || x.sizeId < 1))))
      return res.status(400).json({ error: 'Confira quantidade, tamanho e itens selecionados.' });
    const activeSizeIds = [...new Set(requested.filter(x => x.qty > 0).map(x => x.sizeId))];
    const sizeRows = activeSizeIds.length ? (await db.query('SELECT s.id,s.name,s.price_cents,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id WHERE s.id=ANY($1::int[]) AND s.active=true AND p.active=true', [activeSizeIds])).rows : [];
    if (sizeRows.length !== activeSizeIds.length)
      return res.status(400).json({ error: 'Um dos tamanhos escolhidos não está mais disponível.' });
    const allOptionIds = [...new Set(requested.filter(x => x.qty > 0).flatMap(x => x.optionIds))];
    const optionRows = allOptionIds.length ? (await db.query('SELECT id,name,category,price_cents FROM options WHERE id=ANY($1::int[]) AND active=true', [allOptionIds])).rows : [];
    if (optionRows.length !== allOptionIds.length)
      return res.status(400).json({ error: 'Uma das opções escolhidas não está mais disponível.' });
    const maxToppings = Number((await getSettings()).max_free_toppings || 5);
    for (const x of requested) {
      if (x.qty === 0)
        continue;
      const size = sizeRows.find(z => z.id === x.sizeId);
      const selected = x.optionIds.map(id => optionRows.find(opt => opt.id === id));
      normalized.push(buildOrderItem({ size, options: selected, quantity: x.qty, maxToppings }));
    }
    if (!normalized.length)
      return res.status(400).json({ error: 'O pedido precisa ter pelo menos um item.' });
    const { subtotalCents: subtotal, itemCount: editedCount } = summarizeItems(normalized);
    assertWithinOrderLimit(subtotal);
    // Mesma checagem de estoque da criação do pedido (o estoque só é baixado em "Preparando", então aqui o saldo ainda é integral).
    const editStockRows = (await db.query('SELECT r.inventory_item_id,r.size_id,r.quantity,i.name,i.quantity AS stock FROM inventory_recipes r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.size_id=ANY($1::int[]) AND i.active=true', [activeSizeIds])).rows;
    const editShortage = findStockShortage(normalized.map(n => ({ sizeId: n.sizeId, quantity: n.quantity })), editStockRows);
    if (editShortage)
      return res.status(409).json({ error: `Não temos ${editShortage.name} suficiente para essa alteração. Escolha um tamanho menor, reduza a quantidade ou fale com a loja pelo WhatsApp.` });
    const name = String(req.body.customerName || o.customer_name).trim(), address = String(req.body.address || o.address).trim(), notes = String(req.body.notes ?? o.notes).trim().slice(0, 1000);
    if (name.length < 2 || name.length > 120 || address.length < 6 || address.length > 400)
      return res.status(400).json({ error: 'Confira o nome e o endereço.' });
    const zoneId = Number(req.body.zoneId || 0);
    const zone = zoneId ? await db.query('SELECT name,fee_cents FROM delivery_zones WHERE id=$1 AND active=true', [zoneId]) : null;
    if (zoneId && (!zone || !zone.rowCount))
      return res.status(400).json({ error: 'Bairro não disponível. Escolha outro.' });
    const neighborhood = zone?.rows[0]?.name || o.neighborhood, fee = zone?.rows[0]?.fee_cents ?? o.delivery_fee_cents;
    const scheduled = req.body.scheduledFor === undefined ? o.scheduled_for : (req.body.scheduledFor ? new Date(req.body.scheduledFor) : null);
    if (scheduled && Number.isNaN(new Date(scheduled).getTime()))
      return res.status(400).json({ error: 'Data de agendamento inválida.' });
    const editSettings = await getSettings();
    // Mudança de horário na edição segue as mesmas regras de um pedido novo.
    if (req.body.scheduledFor !== undefined) {
      if (req.body.scheduledFor) {
        const minMin = Number(editSettings.minimum_schedule_minutes || 30);
        if (new Date(scheduled).getTime() < Date.now() + minMin * 60000)
          return res.status(400).json({ error: `Agende com pelo menos ${minMin} minutos de antecedência.` });
        if (!isOpenAt(new Date(scheduled), editSettings))
          return res.status(400).json({ error: 'O horário agendado precisa estar dentro do funcionamento da loja.' });
      }
      else if (editSettings.manual_closed === 'true' || !isOpenAt(new Date(), editSettings))
        return res.status(409).json({ error: 'A loja está fechada para pedidos imediatos. Escolha um horário agendado.' });
    }
    // Cupom do pedido: se foi desativado ou o subtotal editado ficou abaixo do mínimo, ele é removido (sem erro).
    let couponRow = null;
    if (o.coupon_code) {
      const c = await db.query('SELECT code,discount_type,discount_value,min_subtotal_cents FROM coupons WHERE code=$1 AND active=true', [o.coupon_code]);
      if (c.rowCount)
        couponRow = c.rows[0];
    }
    const pricing = priceOrder({ subtotalCents: subtotal, itemCount: editedCount, deliveryFeeCents: fee, combo: comboRules(editSettings), coupon: couponRow });
    const { comboDiscountCents: comboDiscount, couponDiscountCents: discount, couponCode, totalCents: total } = pricing;
    const updated = await db.query(`UPDATE orders SET customer_name=$1,address=$2,neighborhood=$3,notes=$4,scheduled_for=$5,items=$6,subtotal_cents=$7,delivery_fee_cents=$8,discount_cents=$9,coupon_code=$10,combo_discount_cents=$11,total_cents=$12,updated_at=NOW() WHERE id=$13 RETURNING order_code,status`, [name, address, neighborhood, notes, scheduled, JSON.stringify(normalized), subtotal, fee, discount, couponCode, comboDiscount, total, o.id]);
    await client.query('COMMIT');
    const settings = await getSettings();
    const loyalty = await db.query("SELECT COALESCE(SUM(points),0)::int AS balance FROM loyalty_points WHERE regexp_replace(customer_phone,'[^0-9]','','g')=$1", [phone]);
    res.json({
      ok: true, loyaltyBalance: loyalty.rows[0].balance, canEdit: EDITABLE_STATUSES.includes(updated.rows[0].status), canCancel: EDITABLE_STATUSES.includes(updated.rows[0].status), orderCode: code, status: updated.rows[0].status, customerName: name, phone: o.customer_phone, address, neighborhood, notes, scheduledFor: scheduled, paymentMethod: o.payment_method, changeFor: o.change_for, items: normalized, subtotalCents: subtotal, discountCents: discount, comboDiscountCents: comboDiscount, couponCode, estimatedMinutesMin: o.estimated_minutes_min || 35, estimatedMinutesMax: o.estimated_minutes_max || 55, deliveryFeeCents: fee, totalCents: total, whatsappNumber: String(settings.whatsapp_number || '').replace(/\D/g, ''),
      // O total pode ter mudado: gera o Pix de novo com o valor atualizado (o código antigo ficaria com o valor errado).
      pix: o.payment_method === 'Pix' ? buildOrderPix(settings, { amountCents: total, orderCode: code }) : null
    });
  }
  catch (e) {
    next(e);
  }
  finally {
    if (client) {
      await client.query('ROLLBACK').catch(() => { });
      client.release();
    }
  }
});
router.post('/orders/:code/cancel', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const code = String(req.params.code || '').toUpperCase(), phone = String(req.body.phone || '').replace(/\D/g, '');
    if (!lookupGuard(req, res, code))
      return;
    await client.query('BEGIN');
    const found = await client.query("SELECT * FROM orders WHERE order_code=$1 AND regexp_replace(customer_phone,'[^0-9]','','g')=$2 FOR UPDATE", [code, phone]);
    if (!found.rowCount)
      lookupFail(req, code);
    if (!found.rowCount || !EDITABLE_STATUSES.includes(found.rows[0].status))
      throw Object.assign(new Error('Não foi possível cancelar pelo site. Confira os dados ou, se a loja já começou o preparo, fale com ela pelo WhatsApp.'), { status: 409 });
    const order = found.rows[0];
    const consumed = await client.query("SELECT * FROM inventory_movements WHERE order_id=$1 AND movement_type='consumo'", [order.id]);
    for (const movement of consumed.rows) {
      const key = `order-${order.id}-return-${movement.inventory_item_id}`;
      const already = await client.query('SELECT 1 FROM inventory_movements WHERE idempotency_key=$1', [key]);
      if (already.rowCount)
        continue;
      await client.query('UPDATE inventory_items SET quantity=quantity+$1,updated_at=NOW() WHERE id=$2', [movement.quantity, movement.inventory_item_id]);
      await client.query('UPDATE options o SET active=CASE WHEN i.auto_disable THEN i.quantity>0 ELSE o.active END FROM inventory_items i WHERE i.id=$1 AND o.id=i.option_id', [movement.inventory_item_id]);
      await client.query("INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,unit_cost,reason,order_id,idempotency_key) VALUES($1,'devolucao',$2,$3,'Devolução por cancelamento do cliente',$4,$5) ON CONFLICT(idempotency_key) DO NOTHING", [movement.inventory_item_id, movement.quantity, movement.unit_cost, order.id, key]);
    }
    const updated = await client.query("UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1 RETURNING order_code,customer_name,customer_phone,total_cents", [order.id]);
    await client.query('COMMIT');
    const settings = await getSettings();
    res.json({ ok: true, ...updated.rows[0], whatsappNumber: String(settings.whatsapp_number || '').replace(/\D/g, '') });
  }
  catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    if (e.status)
      return res.status(e.status).json({ error: e.message });
    next(e);
  }
  finally {
    client.release();
  }
});
export default router;
