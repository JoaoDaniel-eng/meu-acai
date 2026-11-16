import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleMessages, firstName, pickDailyMessage } from './dailyMessages.js';

// 15/11/2026 é domingo; 16 é segunda; 20 é sexta; 21 é sábado.
test('firstName usa só o primeiro nome, com maiúscula inicial, e ignora cadastros estranhos', () => {
  assert.equal(firstName('maria da SILVA'), 'Maria');
  assert.equal(firstName('  José  Carlos '), 'José');
  assert.equal(firstName(''), '');
  assert.equal(firstName(null), '');
  assert.equal(firstName('J'), '');
  assert.equal(firstName('123456'), '');
  assert.equal(firstName('<script>'), '');
  assert.equal(firstName('Maximiliano'.repeat(3)), '');
});
test('a mesma data sempre escolhe a mesma mensagem', () => {
  assert.deepEqual(pickDailyMessage({ dateKey: '2026-11-16', name: 'Ana' }), pickDailyMessage({ dateKey: '2026-11-16', name: 'Ana' }));
});
test('com nome usa a versão personalizada; sem nome nunca deixa {nome} no texto', () => {
  const seen = new Set();
  for (let d = 1; d <= 28; d++) {
    const dateKey = `2026-11-${String(d).padStart(2, '0')}`;
    const anon = pickDailyMessage({ dateKey }), named = pickDailyMessage({ dateKey, name: 'Ana Souza' });
    assert.ok(!anon.title.includes('{nome}') && !anon.body.includes('{nome}'), dateKey);
    assert.ok(!named.title.includes('{nome}') && !named.body.includes('{nome}'), dateKey);
    if (named.title.includes('Ana')) seen.add(dateKey);
  }
  assert.ok(seen.size > 5, 'várias mensagens devem usar o nome');
});
test('toda mensagem tem título e corpo curtos, link para o cardápio e tag que substitui a anterior', () => {
  for (let d = 0; d < 120; d++) {
    const dateKey = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
    const m = pickDailyMessage({ dateKey, name: 'Ana', settings: { free_delivery_min: '50', combo_discount_percent: '10', combo_min_items: '3' } });
    assert.ok(m.title.length > 5 && m.title.length <= 60, m.title);
    assert.ok(m.body.length > 10 && m.body.length <= 120, m.body);
    assert.equal(m.url, '/#cardapio');
    assert.equal(m.tag, 'acai-diario');
    assert.equal(m.kind, 'daily');
  }
});
test('mensagens de frete grátis e de combo só existem quando a loja tem essas promoções', () => {
  const off = eligibleMessages('2026-11-16', { free_delivery_min: '0', combo_discount_percent: '0' }).list;
  assert.ok(!off.some(m => /Frete grátis|Combo/.test(m.title)));
  const on = eligibleMessages('2026-11-16', { free_delivery_min: '49,90', combo_discount_percent: '10', combo_min_items: '3' });
  const free = on.list.find(m => /Frete grátis/.test(m.title)), combo = on.list.find(m => /Combo/.test(m.title));
  assert.match(free.body(on.ctx), /R\$\s?49,90/);
  assert.match(combo.body(on.ctx), /3 açaís.*10%/);
});
test('mensagens de sexta, sábado e domingo só aparecem no dia certo', () => {
  const titles = day => eligibleMessages(day).list.map(m => m.title).join('|');
  assert.match(titles('2026-11-20'), /Sextou/);
  assert.doesNotMatch(titles('2026-11-16'), /Sextou|Sábado pede|Domingo de açaí/);
  assert.match(titles('2026-11-21'), /Sábado pede/);
  assert.match(titles('2026-11-15'), /Domingo de açaí/);
});
test('em 60 dias seguidos o cliente quase nunca recebe a mesma mensagem duas vezes seguidas', () => {
  let repeats = 0, prev = null;
  for (let d = 0; d < 60; d++) {
    const dateKey = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
    const { title } = pickDailyMessage({ dateKey });
    if (title === prev) repeats++;
    prev = title;
  }
  assert.ok(repeats <= 2, `repetições seguidas: ${repeats}`);
});
