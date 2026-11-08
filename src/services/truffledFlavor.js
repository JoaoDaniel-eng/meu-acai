// Cadastro de novos sabores trufados pelo painel: valida o que a dona digitou antes de gravar.
import { parseUnitStock } from './unitStock.js';
export const MAX_FLAVOR_SIZES = 6;
// Corpo esperado: { name, imageUrl?, sizes: [{ name, priceCents, stockQuantity? }] }.
// Devolve { value } pronto para gravar ou { error } com mensagem em português.
export function parseNewTruffledFlavor(body) {
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120)
    return { error: 'Informe o nome do sabor (2 a 120 letras).' };
  const imageUrl = String(body?.imageUrl ?? '').trim();
  if (imageUrl.length > 1000)
    return { error: 'Endereço da imagem muito longo.' };
  if (imageUrl && !(/^(https:\/\/|\/)/i).test(imageUrl))
    return { error: 'Use um endereço HTTPS ou caminho local para a imagem.' };
  if (!Array.isArray(body?.sizes) || !body.sizes.length || body.sizes.length > MAX_FLAVOR_SIZES)
    return { error: `Informe de 1 a ${MAX_FLAVOR_SIZES} tamanhos.` };
  const sizes = [], seen = new Set();
  for (const raw of body.sizes) {
    const sizeName = String(raw?.name ?? '').trim().replace(/\s+/g, ' ');
    if (!sizeName || sizeName.length > 80)
      return { error: 'Cada tamanho precisa de um nome (até 80 letras).' };
    if (seen.has(sizeName.toLowerCase()))
      return { error: `O tamanho “${sizeName}” está repetido.` };
    seen.add(sizeName.toLowerCase());
    const priceCents = Number(raw?.priceCents);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 500000)
      return { error: `Preço inválido em “${sizeName}”.` };
    const stock = parseUnitStock(raw?.stockQuantity);
    if (stock.error)
      return { error: `${sizeName}: ${stock.error}` };
    sizes.push({ name: sizeName, priceCents, stockQuantity: stock.value });
  }
  return { value: { name, imageUrl: imageUrl || null, sizes } };
}
