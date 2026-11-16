// Mensagens do lembrete diário de açaí (notificação push para clientes).
// A escolha é determinística: o mesmo dia sempre sorteia a mesma mensagem, e dias seguidos andam pela lista,
// então o cliente não recebe a mesma frase duas vezes seguidas. Funções puras: não tocam no banco nem na rede.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_URL = '/#cardapio';

// Cada mensagem tem título (e, se o cliente tem nome, uma versão com {nome}), corpo e, opcionalmente, uma condição.
// Mensagens que citam frete grátis ou combo só entram se a loja realmente tiver essas promoções ligadas.
const MESSAGES = [
  { title: 'Bateu aquela vontade de açaí? 🍇', named: '{nome}, bateu vontade de açaí? 🍇', body: 'Monte o seu do jeitinho que você gosta e peça em poucos toques.' },
  { title: 'Seu açaí está te esperando 💜', named: '{nome}, seu açaí está te esperando 💜', body: 'Escolha o tamanho, capriche nos acompanhamentos e peça delivery ou retire na loja.' },
  { title: 'Hora de uma pausa gostosa 😋', named: '{nome}, que tal uma pausa gostosa? 😋', body: 'Um açaí geladinho deixa o fim de tarde bem melhor. Bora pedir?' },
  { title: 'Cremoso, geladinho e do seu jeito 🧊', body: 'Escolha seus acompanhamentos favoritos e faça seu pedido agora.' },
  { title: 'Já provou nossos açaís trufados? 🍫', body: 'Receitas prontas e irresistíveis para quem quer um mimo extra hoje.' },
  { title: 'Hoje tem açaí! 🍓', named: '{nome}, hoje tem açaí! 🍓', body: 'Peça agora e receba geladinho em casa.' },
  { title: 'A vontade de doce chegou? 🍫', body: 'Açaí com seus acompanhamentos favoritos é a resposta. Peça agora!' },
  { title: 'Fim de tarde combina com açaí 🌇', named: '{nome}, fim de tarde combina com açaí 🌇', body: 'Faça seu pedido e relaxe: a gente cuida do resto.' },
  { title: 'Seu próximo açaí está a poucos toques 📲', body: 'Abra o app, monte do seu jeito e pronto!' },
  { title: 'Frete grátis no seu açaí 🛵', named: '{nome}, frete grátis no seu açaí 🛵', body: ctx => `Pedidos a partir de ${ctx.freeDeliveryLabel} têm entrega grátis. Aproveite hoje!`, when: ctx => ctx.freeDeliveryLabel },
  { title: 'Combo com desconto no açaí 🎉', body: ctx => `Peça ${ctx.comboMin} açaís e ganhe ${ctx.comboPercent}% de desconto. Chame alguém e aproveitem!`, when: ctx => ctx.comboPercent > 0 },
  { title: 'Sextou com açaí! 🎉', named: '{nome}, sextou com açaí! 🎉', body: 'Comece o fim de semana com um açaí do jeito que você ama.', when: ctx => ctx.weekday === 5 },
  { title: 'Sábado pede açaí 💜', body: 'Capriche nos acompanhamentos e aproveite o dia.', when: ctx => ctx.weekday === 6 },
  { title: 'Domingo de açaí é tradição 🍇', named: '{nome}, domingo é dia de açaí 🍇', body: 'Peça o seu e deixe o domingo ainda melhor.', when: ctx => ctx.weekday === 0 }
];

// Primeiro nome para tratar o cliente com carinho. Se o cadastro tiver algo estranho (números, símbolos), melhor não usar.
export function firstName(fullName) {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  if (first.length < 2 || first.length > 20 || !/^[\p{L}'-]+$/u.test(first))
    return '';
  return first.charAt(0).toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR');
}

function freeDeliveryLabel(settings) {
  const reais = Number(String(settings.free_delivery_min ?? '').replace(',', '.'));
  if (!Number.isFinite(reais) || reais <= 0)
    return '';
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Dias desde 1970 a partir de "AAAA-MM-DD" (sempre o dia do relógio de São Paulo, vindo de pushSchedule.js).
function dayNumber(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function weekdayOf(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Mensagens elegíveis hoje (respeitando dia da semana e promoções ligadas).
export function eligibleMessages(dateKey, settings = {}) {
  const ctx = {
    weekday: weekdayOf(dateKey),
    freeDeliveryLabel: freeDeliveryLabel(settings),
    comboMin: Number(settings.combo_min_items || 2),
    comboPercent: Number(settings.combo_discount_percent || 0)
  };
  return { ctx, list: MESSAGES.filter(m => !m.when || m.when(ctx)) };
}

// Devolve { title, body, url, tag, kind } pronto para virar o corpo do push.
export function pickDailyMessage({ dateKey, name = '', settings = {} }) {
  const { ctx, list } = eligibleMessages(dateKey, settings);
  const message = list[dayNumber(dateKey) % list.length];
  const nome = firstName(name);
  const title = (nome && message.named ? message.named.replace('{nome}', nome) : message.title);
  const body = typeof message.body === 'function' ? message.body(ctx) : message.body;
  return { title, body, url: DAILY_URL, tag: 'acai-diario', kind: 'daily' };
}
