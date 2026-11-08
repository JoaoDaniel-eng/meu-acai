import test from 'node:test';
import assert from 'node:assert/strict';
import { lowStockLabel, parseUnitStock, reservedToMap, reservedToObject, shortageMessage, syncUnitStock, unitStockState, unitsBySize } from './unitStock.js';

test('parseUnitStock: vazio vira "sem controle" e inteiros de 0 a 9999 valem', () => {
  assert.deepEqual(parseUnitStock(''), { value: null });
  assert.deepEqual(parseUnitStock(null), { value: null });
  assert.deepEqual(parseUnitStock(undefined), { value: null });
  assert.deepEqual(parseUnitStock('10'), { value: 10 });
  assert.deepEqual(parseUnitStock(0), { value: 0 });
});
test('parseUnitStock: recusa negativo, decimal, texto e valor enorme', () => {
  for (const bad of [-1, 1.5, 'abc', 10000, '1e9'])
    assert.ok(parseUnitStock(bad).error, `deveria recusar ${bad}`);
});
test('aviso de poucas unidades', () => {
  assert.equal(lowStockLabel(3), 'Os 3 últimos!');
  assert.equal(lowStockLabel(2), 'Os 2 últimos!');
  assert.equal(lowStockLabel(1), 'Último!');
});
test('unitStockState: sem controle, normal, últimos e esgotado', () => {
  assert.deepEqual(unitStockState(null), { tracked: false, soldOut: false, low: false, left: null, label: null });
  assert.equal(unitStockState(10).low, false);
  assert.equal(unitStockState(10).label, null);
  assert.equal(unitStockState(4).low, false);
  assert.equal(unitStockState(3).label, 'Os 3 últimos!');
  assert.equal(unitStockState(1).label, 'Último!');
  assert.deepEqual(unitStockState(0), { tracked: true, soldOut: true, low: false, left: 0, label: null });
});
test('unitsBySize soma copos do mesmo tamanho e ignora itens inválidos', () => {
  const m = unitsBySize([{ sizeId: 5, quantity: 2 }, { sizeId: '5', quantity: 1 }, { sizeId: 7, quantity: 4 }, { sizeId: 0, quantity: 1 }, { sizeId: 9, quantity: 0 }]);
  assert.deepEqual([...m], [[5, 3], [7, 4]]);
});
test('reservedToMap / reservedToObject ida e volta', () => {
  const map = reservedToMap({ 5: 3, 7: 1, 9: 0, x: 2 });
  assert.deepEqual([...map], [[5, 3], [7, 1]]);
  assert.deepEqual(reservedToObject(map), { 5: 3, 7: 1 });
  assert.equal(reservedToMap(null).size, 0);
});
test('mensagens de falta de estoque', () => {
  assert.match(shortageMessage({ productName: 'Ninho com Morango', sizeName: '400 ml', left: 0 }), /acabou/);
  assert.match(shortageMessage({ productName: 'Ninho com Morango', sizeName: '400 ml', left: 1 }), /Só temos 1 unidade de/);
  assert.match(shortageMessage({ productName: 'Ninho com Morango', sizeName: '400 ml', left: 2 }), /Só temos 2 unidades de/);
});

// Banco de mentira: interpreta só as duas consultas de syncUnitStock, com a mesma regra do SQL real.
function fakeDb(rows) {
  return {
    rows,
    async query(sql, params) {
      if (sql.startsWith('UPDATE product_sizes')) {
        const [give, take, id] = params, row = rows[id];
        if (!row || row.stock_quantity === null || row.stock_quantity + give < take) return { rowCount: 0, rows: [] };
        row.stock_quantity = row.stock_quantity + give - take;
        return { rowCount: 1, rows: [{ stock_quantity: row.stock_quantity }] };
      }
      const row = rows[params[0]];
      return row ? { rowCount: 1, rows: [{ stock_quantity: row.stock_quantity, name: row.name, product_name: row.product_name }] } : { rowCount: 0, rows: [] };
    }
  };
}
const catalog = () => ({
  1: { name: '400 ml', product_name: 'Ninho com Morango', stock_quantity: 10 },
  2: { name: '500 ml', product_name: 'Ninho com Morango', stock_quantity: 5 },
  3: { name: '300 ml', product_name: 'Tradicional', stock_quantity: null }
});
test('compra de 1 trufado de 400 ml: 10 vira 9', async () => {
  const db = fakeDb(catalog());
  const r = await syncUnitStock(db, new Map(), new Map([[1, 1]]));
  assert.equal(r.shortage, null);
  assert.equal(db.rows[1].stock_quantity, 9);
  assert.deepEqual([...r.reserved], [[1, 1]]);
});
test('chegando a 3 ou menos o cardápio avisa "Os 3 últimos!"', async () => {
  const db = fakeDb(catalog());
  await syncUnitStock(db, new Map(), new Map([[1, 7]]));
  assert.equal(db.rows[1].stock_quantity, 3);
  assert.equal(unitStockState(db.rows[1].stock_quantity).label, 'Os 3 últimos!');
});
test('pedir mais do que existe recusa e informa quantas restam', async () => {
  const db = fakeDb(catalog());
  const r = await syncUnitStock(db, new Map(), new Map([[2, 6]]));
  assert.equal(r.shortage.left, 5);
  assert.equal(r.shortage.productName, 'Ninho com Morango');
  assert.equal(db.rows[2].stock_quantity, 5);
});
test('esgotado: sem unidades nenhuma compra passa', async () => {
  const rows = catalog(); rows[1].stock_quantity = 0;
  const r = await syncUnitStock(fakeDb(rows), new Map(), new Map([[1, 1]]));
  assert.equal(r.shortage.left, 0);
});
test('tamanho sem controle (NULL) vende sem limite e não reserva nada', async () => {
  const db = fakeDb(catalog());
  const r = await syncUnitStock(db, new Map(), new Map([[3, 50]]));
  assert.equal(r.shortage, null);
  assert.equal(r.reserved.size, 0);
  assert.equal(db.rows[3].stock_quantity, null);
});
test('cancelar devolve exatamente o que foi reservado', async () => {
  const db = fakeDb(catalog());
  const { reserved } = await syncUnitStock(db, new Map(), new Map([[1, 3], [2, 2]]));
  assert.equal(db.rows[1].stock_quantity, 7);
  await syncUnitStock(db, reserved, new Map());
  assert.equal(db.rows[1].stock_quantity, 10);
  assert.equal(db.rows[2].stock_quantity, 5);
});
test('editar pedido: troca 3 de 400 ml por 1 de 400 ml e 2 de 500 ml numa passada', async () => {
  const db = fakeDb(catalog());
  const first = await syncUnitStock(db, new Map(), new Map([[1, 3]]));
  const edited = await syncUnitStock(db, first.reserved, new Map([[1, 1], [2, 2]]));
  assert.equal(edited.shortage, null);
  assert.equal(db.rows[1].stock_quantity, 9);
  assert.equal(db.rows[2].stock_quantity, 3);
  assert.deepEqual([...edited.reserved], [[1, 1], [2, 2]]);
});
test('editar pedido pode manter a mesma quantidade mesmo com estoque zerado', async () => {
  const rows = catalog(); rows[2].stock_quantity = 2;
  const db = fakeDb(rows);
  const first = await syncUnitStock(db, new Map(), new Map([[2, 2]]));
  assert.equal(db.rows[2].stock_quantity, 0);
  const again = await syncUnitStock(db, first.reserved, new Map([[2, 2]]));
  assert.equal(again.shortage, null);
  assert.equal(db.rows[2].stock_quantity, 0);
});
test('devolver para tamanho que a loja deixou de controlar ou apagou não dá erro', async () => {
  const rows = catalog(); rows[1].stock_quantity = null;
  const db = fakeDb(rows);
  const r = await syncUnitStock(db, new Map([[1, 2], [99, 1]]), new Map());
  assert.equal(r.shortage, null);
  assert.equal(db.rows[1].stock_quantity, null);
});
