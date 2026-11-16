import { getLocalParts } from './time.js';
import { openingDaysOf, saoPauloToDate } from './schedule.js';

// Regras do lembrete diário (push para clientes), sem acessar banco nem rede: só recebe as configurações e o relógio.
// O agendador (pushScheduler.js) usa o resultado para saber se envia agora ou quando olhar de novo.
// Olhar o banco só quando necessário é de propósito: consultar a cada minuto manteria o Neon acordado o dia todo.

export const DEFAULT_DAILY_TIME = '16:30';
// Não adianta mandar "peça já" faltando pouco para fechar: o envio vai até 45 min antes do fechamento.
export const MINUTES_BEFORE_CLOSING = 45;
const RECHECK_WHEN_PAUSED_MS = 20 * 60 * 1000;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const toMinutes = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

export const dailyPushTime = settings => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings.push_daily_time || '')) ? settings.push_daily_time : DEFAULT_DAILY_TIME);

// "AAAA-MM-DD" no relógio de São Paulo. É a chave de "uma vez por dia".
export function localDateKey(date = new Date()) {
  const p = getLocalParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// action: 'send' (enviar agora), 'wait' (ainda não chegou a hora) ou 'skip' (hoje não envia).
// checkAt: quando vale a pena perguntar de novo (não precisa acordar o banco antes disso).
export function planDailyPush(settings = {}, now = new Date()) {
  const p = getLocalParts(now), dateKey = `${p.year}-${p.month}-${p.day}`;
  // Hoje 00:05: o Date.UTC dentro de saoPauloToDate aceita "dia 32" e vira o mês sozinho.
  const tomorrow = saoPauloToDate(+p.year, +p.month, +p.day + 1, 0, 5);
  const result = (action, reason, checkAt) => ({ action, reason, dateKey, checkAt });
  if (String(settings.push_daily_enabled) === 'false')
    return result('skip', 'desligado', tomorrow);
  if (!openingDaysOf(settings).includes(WEEKDAYS[p.weekday]))
    return result('skip', 'loja não abre hoje', tomorrow);
  const nowMin = Number(p.hour) * 60 + Number(p.minute), startMin = toMinutes(dailyPushTime(settings));
  const endMin = toMinutes(settings.closing_time || '22:00') - MINUTES_BEFORE_CLOSING;
  if (endMin <= startMin)
    return result('skip', 'horário do lembrete fora do funcionamento', tomorrow);
  if (nowMin < startMin)
    return result('wait', 'ainda não é a hora', saoPauloToDate(+p.year, +p.month, +p.day, Math.floor(startMin / 60), startMin % 60));
  if (nowMin >= endMin)
    return result('skip', 'passou do horário de hoje', tomorrow);
  // Loja pausada à mão: não faz sentido tentar o cliente a pedir. Tenta de novo daqui a pouco, dentro da janela.
  if (String(settings.manual_closed) === 'true')
    return result('wait', 'loja pausada', new Date(Math.min(now.getTime() + RECHECK_WHEN_PAUSED_MS, saoPauloToDate(+p.year, +p.month, +p.day, Math.floor(endMin / 60), endMin % 60).getTime())));
  return result('send', 'na hora', tomorrow);
}
