import { test } from 'node:test';
import assert from 'node:assert/strict';
// O gerador de QR do painel é um script de navegador: ele publica makeQr/qrSvg no objeto global.
await import('../../public/js/admin/qr.js');
const { makeQr, qrSvg } = globalThis;

test('makeQr: tamanho pela versão e padrões de localização nos três cantos', () => {
  const m = makeQr('https://a.co/rapido');
  assert.equal(m.length, 25); // versão 2
  assert.ok(m.every(row => row.length === 25));
  for (const [x, y] of [[0, 0], [18, 0], [0, 18]]) {
    assert.equal(m[y][x], true); // canto do quadrado externo
    assert.equal(m[y + 1][x + 1], false); // anel claro
    assert.equal(m[y + 3][x + 3], true); // centro escuro
  }
});
test('makeQr: textos maiores sobem de versão e o resultado é sempre o mesmo', () => {
  const url = 'https://exemplo.com.br/' + 'z'.repeat(230);
  const a = makeQr(url), b = makeQr(url);
  assert.equal(a.length, 65); // versão 12
  assert.deepEqual(a, b);
  assert.throws(() => makeQr('x'.repeat(3000)), /grande demais/);
});
test('qrSvg devolve um SVG com zona silenciosa', () => {
  const svg = qrSvg('https://a.co/rapido', 4);
  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 33 33"/);
});
