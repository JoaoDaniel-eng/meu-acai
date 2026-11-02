import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateComboDiscount } from './promotions.js';
import {
  MAX_ORDER_SUBTOTAL_CENTS,
  PricingError,
  assertWithinOrderLimit,
  buildOrderItem,
  calculateCouponDiscount,
  comboRules,
  formatBRL,
  priceOrder,
  summarizeItems,
} from './pricing.js';

const size = { id: 12, name: '500 ml', price_cents: 2200, product_name: 'Açaí' };
const topping = id => ({ id, name: `Acomp ${id}`, category: 'topping', price_cents: 0 });
const syrup = id => ({ id, name: `Calda ${id}`, category: 'syrup', price_cents: 0 });
const extra = { id: 90, name: 'Nutella', category: 'extra', price_cents: 400 };
const combo = { minItems: 2, percent: 5 };

test('buildOrderItem soma tamanho + adicionais e multiplica pela quantidade', () => {
  const item = buildOrderItem({ size, options: [topping(1), extra], quantity: 2 });
  assert.equal(item.unitPriceCents, 2600);
  assert.equal(item.lineTotalCents, 5200);
  assert.deepEqual(item.options[1], { id: 90, name: 'Nutella', category: 'extra', priceCents: 400 });
  assert.equal(item.product, 'Açaí');
  assert.equal(item.sizeId, 12);
});

test('buildOrderItem aceita preços vindos como texto do banco', () => {
  const item = buildOrderItem({ size: { ...size, price_cents: '2200' }, options: [{ ...extra, price_cents: '400' }], quantity: 1 });
  assert.equal(item.unitPriceCents, 2600);
});

test('buildOrderItem recusa adicional inexistente, excesso de acompanhamentos e mais de uma calda', () => {
  assert.throws(() => buildOrderItem({ size, options: [undefined], quantity: 1 }), PricingError);
  const six = [1, 2, 3, 4, 5, 6].map(topping);
  assert.throws(() => buildOrderItem({ size, options: six, quantity: 1, maxToppings: 5 }), /no máximo 5 acompanhamentos/);
  assert.doesNotThrow(() => buildOrderItem({ size, options: six, quantity: 1, maxToppings: 6 }));
  assert.throws(() => buildOrderItem({ size, options: [syrup(1), syrup(2)], quantity: 1 }), /apenas uma calda/);
});

test('summarizeItems soma subtotal e quantidade de copos', () => {
  const items = [buildOrderItem({ size, options: [], quantity: 2 }), buildOrderItem({ size, options: [extra], quantity: 1 })];
  assert.deepEqual(summarizeItems(items), { subtotalCents: 4400 + 2600, itemCount: 3 });
});

test('assertWithinOrderLimit recusa pedido acima do limite', () => {
  assert.doesNotThrow(() => assertWithinOrderLimit(MAX_ORDER_SUBTOTAL_CENTS));
  assert.throws(() => assertWithinOrderLimit(MAX_ORDER_SUBTOTAL_CENTS + 1), /limite permitido/);
});

test('priceOrder sem combo nem cupom: total = subtotal + frete', () => {
  const r = priceOrder({ subtotalCents: 2200, itemCount: 1, deliveryFeeCents: 500, combo });
  assert.equal(r.comboDiscountCents, 0);
  assert.equal(r.couponCode, null);
  assert.equal(r.totalCents, 2700);
});

test('priceOrder aplica combo a partir da quantidade mínima (exemplo do site: 2 x R$ 26,00 + frete R$ 5,00)', () => {
  const r = priceOrder({ subtotalCents: 5200, itemCount: 2, deliveryFeeCents: 500, combo });
  assert.equal(r.comboDiscountCents, 260);
  assert.equal(r.totalCents, 5200 - 260 + 500);
});

test('priceOrder: cupom percentual incide sobre o subtotal já sem o combo', () => {
  const r = priceOrder({ subtotalCents: 5200, itemCount: 2, deliveryFeeCents: 0, combo, coupon: { code: 'P10', discount_type: 'percent', discount_value: '10', min_subtotal_cents: 0 } });
  assert.equal(r.comboDiscountCents, 260);
  assert.equal(r.couponDiscountCents, Math.floor((4940 * 10) / 100));
  assert.equal(r.couponCode, 'P10');
  assert.equal(r.totalCents, 4940 - 494);
});

test('priceOrder: cupom de valor fixo nunca passa da base, e percentual nunca passa de 100%', () => {
  const fixo = priceOrder({ subtotalCents: 1000, itemCount: 1, combo, coupon: { code: 'F', discount_type: 'fixed', discount_value: 5000, min_subtotal_cents: 0 } });
  assert.equal(fixo.couponDiscountCents, 1000);
  assert.equal(fixo.totalCents, 0);
  const pct = priceOrder({ subtotalCents: 1000, itemCount: 1, deliveryFeeCents: 300, combo, coupon: { code: 'X', discount_type: 'percent', discount_value: 250, min_subtotal_cents: 0 } });
  assert.equal(pct.couponDiscountCents, 1000);
  assert.equal(pct.totalCents, 300);
});

test('priceOrder: o frete não recebe desconto', () => {
  const r = priceOrder({ subtotalCents: 1000, itemCount: 1, deliveryFeeCents: 800, combo, coupon: { code: 'F', discount_type: 'fixed', discount_value: 1000, min_subtotal_cents: 0 } });
  assert.equal(r.totalCents, 800);
});

test('priceOrder: cupom abaixo do subtotal mínimo não é aplicado e informa o motivo', () => {
  const r = priceOrder({ subtotalCents: 2000, itemCount: 1, deliveryFeeCents: 500, combo, coupon: { code: 'M', discount_type: 'fixed', discount_value: 300, min_subtotal_cents: 3000 } });
  assert.equal(r.couponCode, null);
  assert.equal(r.couponDiscountCents, 0);
  assert.equal(r.couponRejected.reason, 'minimum');
  assert.equal(r.couponRejected.minimumCents, 3000);
  assert.match(r.couponRejected.message, /subtotal mínimo de R\$\s30,00/);
  assert.equal(r.totalCents, 2500);
});

test('priceOrder: o mínimo do cupom é conferido depois do combo', () => {
  // 3200 com combo de 5% vira 3040: abaixo do mínimo de 3100, mesmo com o subtotal bruto acima.
  const coupon = { code: 'M', discount_type: 'fixed', discount_value: 100, min_subtotal_cents: 3100 };
  assert.ok(priceOrder({ subtotalCents: 3200, itemCount: 2, combo, coupon }).couponRejected);
  assert.equal(priceOrder({ subtotalCents: 3200, itemCount: 1, combo, coupon }).couponRejected, null);
});

test('comboRules lê as configurações com padrões seguros', () => {
  assert.deepEqual(comboRules({}), { minItems: 2, percent: 5 });
  assert.deepEqual(comboRules({ combo_min_items: '3', combo_discount_percent: '10' }), { minItems: 3, percent: 10 });
});

test('formatBRL formata em reais', () => {
  assert.match(formatBRL(3000), /^R\$\s30,00$/);
  assert.match(formatBRL(null), /^R\$\s0,00$/);
});

// Fórmula que existia antes (copiada de POST /orders): o priceOrder() precisa dar exatamente o mesmo resultado.
function legacyTotals({ subtotal, itemCount, fee, minItems, percent, coupon }) {
  const comboDiscount = calculateComboDiscount(subtotal, itemCount, minItems, percent);
  let discount = 0;
  if (coupon) {
    if (subtotal - comboDiscount < Number(coupon.min_subtotal_cents)) return null;
    discount =
      coupon.discount_type === 'percent'
        ? Math.floor(((subtotal - comboDiscount) * Math.min(100, Number(coupon.discount_value))) / 100)
        : Math.min(subtotal - comboDiscount, Number(coupon.discount_value));
  }
  return { comboDiscount, discount, total: subtotal - comboDiscount - discount + fee };
}

test('priceOrder dá o mesmo resultado da fórmula antiga em 5.000 casos aleatórios', () => {
  let seed = 12345;
  const rand = max => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % max;
  };
  for (let i = 0; i < 5000; i++) {
    const subtotal = rand(300000);
    const itemCount = rand(12);
    const fee = rand(2000);
    const minItems = 2 + rand(3);
    const percent = rand(30);
    const coupon = rand(3) === 0 ? null : { code: 'C', discount_type: rand(2) ? 'percent' : 'fixed', discount_value: rand(2) ? rand(120) : rand(40000), min_subtotal_cents: rand(3) === 0 ? rand(100000) : 0 };
    const old = legacyTotals({ subtotal, itemCount, fee, minItems, percent, coupon });
    const now = priceOrder({ subtotalCents: subtotal, itemCount, deliveryFeeCents: fee, combo: { minItems, percent }, coupon });
    if (old === null) {
      assert.ok(now.couponRejected, `caso ${i}: devia recusar o cupom`);
    } else {
      assert.equal(now.comboDiscountCents, old.comboDiscount, `caso ${i}: combo`);
      assert.equal(now.couponDiscountCents, old.discount, `caso ${i}: cupom`);
      assert.equal(now.totalCents, old.total, `caso ${i}: total`);
    }
    assert.ok(now.totalCents >= fee, `caso ${i}: total nunca fica abaixo do frete`);
  }
});

test('calculateCouponDiscount isolado', () => {
  assert.equal(calculateCouponDiscount(1999, { discount_type: 'percent', discount_value: 10 }), 199);
  assert.equal(calculateCouponDiscount(500, { discount_type: 'fixed', discount_value: '700' }), 500);
});
