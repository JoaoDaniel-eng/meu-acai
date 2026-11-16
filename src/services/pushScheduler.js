import { getPool } from '../db/pool.js';
import { getSettings } from './store.js';
import { planDailyPush } from './pushSchedule.js';
import { pushConfigured, runDailyPush } from './push.js';

// Agendador do lembrete diário. O relógio (a cada minuto) só compara com um horário guardado na memória; o banco só é consultado
// quando chega o momento combinado em `checkAt`. Na prática são 1 ou 2 consultas por dia, então o Neon continua podendo dormir.
// Se o servidor estava dormindo (Render gratuito) e acorda dentro da janela de envio, o lembrete sai assim que ele acorda.
const TICK_MS = 60 * 1000, FIRST_TICK_MS = 20 * 1000, RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;
const state = { checkAt: 0, doneDateKey: null };

// Chamado quando o administrador salva as configurações: o próximo minuto já lê os valores novos.
export function nudgePushScheduler() { state.checkAt = 0; }

export async function tickPushScheduler(now = new Date()) {
  if (now.getTime() < state.checkAt)
    return null;
  try {
    const settings = await getSettings(), plan = planDailyPush(settings, now);
    let result = null;
    if (plan.action === 'send' && state.doneDateKey !== plan.dateKey) {
      // Se der erro, tenta de novo em 5 min (catch abaixo). Repetir é seguro: o banco já marcou quem recebeu hoje (ver runDailyPush).
      result = await runDailyPush(getPool(), { settings, dateKey: plan.dateKey });
      state.doneDateKey = plan.dateKey;
      console.log(`Lembrete diário (${plan.dateKey}): ${result.sent} enviados, ${result.failed} falhas, ${result.removed} assinaturas removidas.`);
    }
    state.checkAt = plan.checkAt.getTime();
    return result;
  }
  catch (err) {
    console.error('Falha no lembrete diário:', err.message);
    state.checkAt = now.getTime() + RETRY_AFTER_ERROR_MS;
    return null;
  }
}

export function startPushScheduler() {
  if (!pushConfigured()) {
    console.warn('Notificações push desligadas: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (veja o README).');
    return null;
  }
  let running = false;
  const run = async () => {
    if (running)
      return;
    running = true;
    try {
      await tickPushScheduler();
    }
    finally {
      running = false;
    }
  };
  setTimeout(run, FIRST_TICK_MS).unref?.();
  const timer = setInterval(run, TICK_MS);
  timer.unref?.();
  return timer;
}
