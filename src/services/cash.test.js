import test from 'node:test';
import assert from 'node:assert/strict';
import { cashDifference, parseCents, summarizeCash } from './cash.js';

test('parseCents aceita só inteiros dentro do limite', () => {
  assert.equal(parseCents(0), 0);
  assert.equal(parseCents('1500'), 1500);
  assert.equal(parseCents(-1), null);
  assert.equal(parseCents(10.5), null);
  assert.equal(parseCents('abc'), null);
  assert.equal(parseCents(0, { allowZero: false }), null);
  assert.equal(parseCents(100000000), null);
});

test('dinheiro esperado = troco + vendas em dinheiro + entradas − retiradas − despesas', () => {
  const s = summarizeCash({
    openingCents: 10000,
    salesRows: [
      { payment_method: 'Dinheiro', orders: 3, total_cents: 6000 },
      { payment_method: 'Pix', orders: 2, total_cents: 4500 },
      { payment_method: 'Cartão de débito', orders: 1, total_cents: 1900 }
    ],
    movements: [
      { kind: 'suprimento', amount_cents: 2000 },
      { kind: 'sangria', amount_cents: 5000 },
      { kind: 'despesa', amount_cents: 1500 }
    ]
  });
  assert.equal(s.cashSalesCents, 6000);
  assert.equal(s.expectedCashCents, 10000 + 6000 + 2000 - 5000 - 1500);
  assert.equal(s.totalSalesCents, 12400);
  assert.equal(s.totalOrders, 6);
  assert.equal(s.byMethod['Cartão de crédito'].totalCents, 0);
});

test('forma de pagamento desconhecida entra no total geral, mas não no dinheiro', () => {
  const s = summarizeCash({ openingCents: 0, salesRows: [{ payment_method: 'Vale', orders: 1, total_cents: 900 }] });
  assert.equal(s.totalSalesCents, 900);
  assert.equal(s.expectedCashCents, 0);
});

test('diferença: sobra positiva, falta negativa', () => {
  assert.equal(cashDifference(10500, 10000), 500);
  assert.equal(cashDifference(9000, 10000), -1000);
  assert.equal(cashDifference(10000, 10000), 0);
});
