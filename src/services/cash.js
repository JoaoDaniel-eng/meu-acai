// Regras do caixa (sem banco de dados, para ficarem fáceis de testar).
// Todos os valores são inteiros em centavos.
export const MOVEMENT_KINDS = { suprimento: 'Entrada de dinheiro', sangria: 'Retirada de dinheiro', despesa: 'Despesa paga do caixa' };
export const MAX_CENTS = 99999999;
export const CASH_METHOD = 'Dinheiro';
export const METHODS = ['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito'];

// Converte e valida um valor em centavos. Devolve o número ou null quando inválido.
export function parseCents(value, { allowZero = true } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_CENTS || (!allowZero && n === 0))
    return null;
  return n;
}

// salesRows: [{ payment_method, orders, total_cents }] · movements: [{ kind, amount_cents }]
export function summarizeCash({ openingCents = 0, salesRows = [], movements = [] }) {
  const byMethod = Object.fromEntries(METHODS.map(m => [m, { orders: 0, totalCents: 0 }]));
  for (const r of salesRows) {
    const key = METHODS.includes(r.payment_method) ? r.payment_method : r.payment_method || 'Outro';
    byMethod[key] ??= { orders: 0, totalCents: 0 };
    byMethod[key].orders += Number(r.orders || 0);
    byMethod[key].totalCents += Number(r.total_cents || 0);
  }
  const sum = kind => movements.filter(m => m.kind === kind).reduce((n, m) => n + Number(m.amount_cents || 0), 0);
  const supplies = sum('suprimento'), withdrawals = sum('sangria'), expenses = sum('despesa');
  const cashSales = byMethod[CASH_METHOD].totalCents;
  const expectedCashCents = Number(openingCents) + cashSales + supplies - withdrawals - expenses;
  const totalSalesCents = Object.values(byMethod).reduce((n, m) => n + m.totalCents, 0);
  const totalOrders = Object.values(byMethod).reduce((n, m) => n + m.orders, 0);
  return { openingCents: Number(openingCents), byMethod, cashSalesCents: cashSales, suppliesCents: supplies, withdrawalsCents: withdrawals, expensesCents: expenses, expectedCashCents, totalSalesCents, totalOrders };
}

// Diferença do fechamento: positivo = sobra, negativo = falta.
export const cashDifference = (countedCents, expectedCents) => Number(countedCents) - Number(expectedCents);
