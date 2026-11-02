// Preço do pedido: uma única fonte de verdade para criar pedido, editar pedido e validar cupom.
// Tudo em centavos (inteiros). Funções puras: não acessam banco nem Express, então são fáceis de testar.
import { calculateComboDiscount } from './promotions.js';

// Acima disso o pedido é recusado (R$ 20.000,00).
export const MAX_ORDER_SUBTOTAL_CENTS = 2000000;

// Erro de regra de preço. As rotas respondem com `status` e `message` (sem expor detalhes internos).
export class PricingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PricingError';
    this.status = status;
  }
}

export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const toCents = value => Number(value || 0);

// Lê as regras de combo das configurações da loja (valores vêm como texto do banco).
export function comboRules(settings = {}) {
  return {
    minItems: Number(settings.combo_min_items || 2),
    percent: Number(settings.combo_discount_percent || 5),
  };
}

// Monta uma linha do pedido a partir do tamanho e dos adicionais já carregados do banco.
// `size`: { id, name, price_cents, product_name }. `options`: lista de { id, name, category, price_cents }
// (um elemento undefined/null significa que o adicional escolhido não existe mais).
export function buildOrderItem({ size, options, quantity, maxToppings = 5 }) {
  if (options.some(option => !option)) throw new PricingError('Adicional inválido.');
  if (options.filter(option => option.category === 'topping').length > maxToppings) {
    throw new PricingError(`Escolha no máximo ${maxToppings} acompanhamentos por açaí.`);
  }
  if (options.filter(option => option.category === 'syrup').length > 1) {
    throw new PricingError('Escolha apenas uma calda por açaí.');
  }
  const unitPriceCents = toCents(size.price_cents) + options.reduce((sum, option) => sum + toCents(option.price_cents), 0);
  return {
    product: size.product_name,
    sizeId: size.id,
    size: size.name,
    quantity,
    options: options.map(option => ({
      id: option.id,
      name: option.name,
      category: option.category,
      priceCents: toCents(option.price_cents),
    })),
    unitPriceCents,
    lineTotalCents: unitPriceCents * quantity,
  };
}

// Soma as linhas já montadas: subtotal e quantidade total de copos (a quantidade conta para o combo).
export function summarizeItems(items) {
  return {
    subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function assertWithinOrderLimit(subtotalCents) {
  if (subtotalCents > MAX_ORDER_SUBTOTAL_CENTS) {
    throw new PricingError('O valor do pedido ultrapassa o limite permitido. Divida em dois pedidos.');
  }
}

// Desconto do cupom sobre a base (subtotal já sem o combo). Percentual é arredondado para baixo
// e nunca passa de 100%; valor fixo nunca passa da base.
export function calculateCouponDiscount(baseCents, coupon) {
  const value = Number(coupon.discount_value);
  if (coupon.discount_type === 'percent') return Math.floor((baseCents * Math.min(100, value)) / 100);
  return Math.min(baseCents, value);
}

export function couponMinimumMessage(minimumCents) {
  return `Este cupom exige um subtotal mínimo de ${formatBRL(minimumCents)}.`;
}

// Calcula todos os valores do pedido.
//   subtotalCents / itemCount: ver summarizeItems
//   deliveryFeeCents: taxa do bairro
//   combo: { minItems, percent } (ver comboRules)
//   coupon: linha da tabela coupons ({ code, discount_type, discount_value, min_subtotal_cents }) ou null
// Se o cupom não atinge o subtotal mínimo, ele NÃO é aplicado e `couponRejected` traz o motivo; quem chama decide
// o que fazer (criar pedido e validar cupom recusam; editar pedido simplesmente remove o cupom).
export function priceOrder({ subtotalCents, itemCount, deliveryFeeCents = 0, combo = {}, coupon = null }) {
  const subtotal = toCents(subtotalCents);
  const fee = toCents(deliveryFeeCents);
  const comboDiscountCents = calculateComboDiscount(subtotal, itemCount, combo.minItems ?? 2, combo.percent ?? 5);
  const base = Math.max(0, subtotal - comboDiscountCents);
  let couponDiscountCents = 0;
  let couponCode = null;
  let couponRejected = null;
  if (coupon) {
    const minimumCents = toCents(coupon.min_subtotal_cents);
    if (base < minimumCents) {
      couponRejected = { reason: 'minimum', minimumCents, message: couponMinimumMessage(minimumCents) };
    } else {
      couponCode = coupon.code;
      couponDiscountCents = calculateCouponDiscount(base, coupon);
    }
  }
  return {
    subtotalCents: subtotal,
    itemCount: Number(itemCount) || 0,
    comboDiscountCents,
    couponCode,
    couponDiscountCents,
    couponRejected,
    deliveryFeeCents: fee,
    totalCents: base - couponDiscountCents + fee,
  };
}
