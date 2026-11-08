// Estoque por unidade (ex.: trufados prontos). Cada tamanho de produto pode ter `stock_quantity`:
//   NULL  = sem controle (vende sem limite, como sempre foi)
//   0..N  = unidades disponíveis; cada pedido desconta na hora e o cancelamento devolve.
// O que cada pedido reservou fica em `orders.unit_stock` ({ "<sizeId>": unidades }) para devolver exatamente o que foi tirado.
export const LOW_STOCK_LIMIT = 3;
export const MAX_UNIT_STOCK = 9999;
// Valor digitado no painel: vazio = sem controle; senão inteiro de 0 a 9999.
export function parseUnitStock(value) {
  if (value === null || value === undefined || String(value).trim() === '')
    return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_UNIT_STOCK)
    return { error: `Estoque inválido. Informe um número inteiro de 0 a ${MAX_UNIT_STOCK}, ou deixe em branco para não controlar.` };
  return { value: n };
}
export function lowStockLabel(left) {
  return left === 1 ? 'Último!' : `Os ${left} últimos!`;
}
// Situação para o cardápio do cliente.
export function unitStockState(stock) {
  if (stock === null || stock === undefined)
    return { tracked: false, soldOut: false, low: false, left: null, label: null };
  const left = Math.max(0, Number(stock) || 0);
  const low = left > 0 && left <= LOW_STOCK_LIMIT;
  return { tracked: true, soldOut: left === 0, low, left, label: low ? lowStockLabel(left) : null };
}
// Soma de copos por tamanho a partir dos itens do pedido: Map(sizeId -> unidades).
export function unitsBySize(items) {
  const units = new Map();
  for (const item of items || []) {
    const id = Number(item.sizeId), qty = item.quantity === undefined ? 1 : Number(item.quantity);
    if (Number.isInteger(id) && id > 0 && qty > 0)
      units.set(id, (units.get(id) || 0) + qty);
  }
  return units;
}
export function reservedToMap(obj) {
  const map = new Map();
  for (const [id, qty] of Object.entries(obj || {})) {
    const n = Number(qty);
    if (Number(id) > 0 && Number.isInteger(n) && n > 0)
      map.set(Number(id), n);
  }
  return map;
}
export const reservedToObject = map => Object.fromEntries([...map].map(([id, qty]) => [String(id), qty]));
export function shortageMessage({ productName, sizeName, left }) {
  const what = `${productName} (${sizeName})`;
  if (left <= 0)
    return `${what} acabou! Escolha outro sabor ou tamanho, ou fale com a loja pelo WhatsApp.`;
  return `Só temos ${left} unidade${left === 1 ? '' : 's'} de ${what}. Reduza a quantidade ou escolha outro sabor.`;
}
// Ajusta o estoque dentro da transação do chamador: devolve o que `previous` (Map) tinha reservado e reserva `wanted` (Map).
// Um único UPDATE por tamanho, em ordem crescente de id, evita corrida entre pedidos simultâneos e travamento cruzado.
// Tamanho sem controle (NULL) é ignorado. Retorna { reserved: Map, shortage }; com `shortage`, o chamador deve dar ROLLBACK.
export async function syncUnitStock(client, previous, wanted) {
  const reserved = new Map();
  const ids = [...new Set([...previous.keys(), ...wanted.keys()])].sort((a, b) => a - b);
  for (const id of ids) {
    const give = previous.get(id) || 0, take = wanted.get(id) || 0;
    const r = await client.query('UPDATE product_sizes SET stock_quantity=stock_quantity+$1-$2 WHERE id=$3 AND stock_quantity IS NOT NULL AND stock_quantity+$1>=$2 RETURNING stock_quantity', [give, take, id]);
    if (r.rowCount) {
      if (take > 0)
        reserved.set(id, take);
      continue;
    }
    const cur = await client.query('SELECT s.stock_quantity,s.name,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id WHERE s.id=$1', [id]);
    if (!cur.rowCount || cur.rows[0].stock_quantity === null)
      continue; // tamanho apagado ou sem controle de unidades
    const row = cur.rows[0];
    return { reserved, shortage: { sizeId: id, productName: row.product_name, sizeName: row.name, left: Math.max(0, Number(row.stock_quantity) + give) } };
  }
  return { reserved, shortage: null };
}
