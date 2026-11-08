import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNewTruffledFlavor } from './truffledFlavor.js';
const ok = { name: '  Ninho   com Oreo ', sizes: [{ name: '400 ml', priceCents: 2000 }, { name: '500 ml', priceCents: 2500, stockQuantity: '5' }] };
test('aceita sabor válido e limpa espaços', () => {
  const r = parseNewTruffledFlavor(ok);
  assert.equal(r.value.name, 'Ninho com Oreo');
  assert.equal(r.value.imageUrl, null);
  assert.deepEqual(r.value.sizes, [{ name: '400 ml', priceCents: 2000, stockQuantity: null }, { name: '500 ml', priceCents: 2500, stockQuantity: 5 }]);
});
test('recusa nome curto, sem tamanhos e tamanho repetido', () => {
  assert.ok(parseNewTruffledFlavor({ ...ok, name: 'A' }).error);
  assert.ok(parseNewTruffledFlavor({ ...ok, sizes: [] }).error);
  assert.ok(parseNewTruffledFlavor({ ...ok, sizes: [{ name: '400 ml', priceCents: 1 }, { name: '400 ML', priceCents: 2 }] }).error);
});
test('recusa preço, estoque e imagem inválidos', () => {
  assert.ok(parseNewTruffledFlavor({ ...ok, sizes: [{ name: '400 ml', priceCents: -1 }] }).error);
  assert.ok(parseNewTruffledFlavor({ ...ok, sizes: [{ name: '400 ml', priceCents: 1.5 }] }).error);
  assert.ok(parseNewTruffledFlavor({ ...ok, sizes: [{ name: '400 ml', priceCents: 100, stockQuantity: -2 }] }).error);
  assert.ok(parseNewTruffledFlavor({ ...ok, imageUrl: 'http://x.com/a.png' }).error);
  assert.equal(parseNewTruffledFlavor({ ...ok, imageUrl: '/images/a.webp' }).value.imageUrl, '/images/a.webp');
});
