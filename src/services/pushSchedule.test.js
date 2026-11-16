import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPushTime, localDateKey, planDailyPush } from './pushSchedule.js';

const settings = { opening_days: '2,3,4,5,6,0', opening_time: '13:30', closing_time: '22:00', push_daily_enabled: 'true', push_daily_time: '16:30' };
// São Paulo é UTC-3. 15/11/2026 é domingo (aberto); 16/11 é segunda (fechada nestas configurações).
const sun = (h, m = 0) => new Date(Date.UTC(2026, 10, 15, h + 3, m));

test('localDateKey usa o dia de São Paulo, não o do UTC', () => {
  assert.equal(localDateKey(new Date('2026-11-16T01:30:00Z')), '2026-11-15');
  assert.equal(localDateKey(new Date('2026-11-16T03:00:00Z')), '2026-11-16');
});
test('antes do horário: espera, e só olhar de novo no próprio horário', () => {
  const p = planDailyPush(settings, sun(10, 0));
  assert.equal(p.action, 'wait');
  assert.equal(p.checkAt.toISOString(), '2026-11-15T19:30:00.000Z');
  assert.equal(p.dateKey, '2026-11-15');
});
test('no horário e dentro do funcionamento: envia, e só olha de novo na madrugada seguinte', () => {
  for (const [h, m] of [[16, 30], [17, 0], [21, 14]]) {
    const p = planDailyPush(settings, sun(h, m));
    assert.equal(p.action, 'send', `${h}:${m}`);
    assert.equal(p.checkAt.toISOString(), '2026-11-16T03:05:00.000Z');
  }
});
test('faltando 45 min ou menos para fechar já não envia mais', () => {
  assert.equal(planDailyPush(settings, sun(21, 15)).action, 'skip');
  assert.equal(planDailyPush(settings, sun(23, 0)).action, 'skip');
});
test('dia em que a loja não abre não envia', () => {
  const monday = new Date(Date.UTC(2026, 10, 16, 20, 0));
  const p = planDailyPush(settings, monday);
  assert.equal(p.action, 'skip');
  assert.match(p.reason, /não abre/);
});
test('lembrete desligado no painel não envia', () => {
  assert.equal(planDailyPush({ ...settings, push_daily_enabled: 'false' }, sun(17)).action, 'skip');
});
test('loja pausada à mão espera e tenta de novo em 20 min, sem passar do fim da janela', () => {
  const paused = { ...settings, manual_closed: 'true' };
  const a = planDailyPush(paused, sun(17, 0));
  assert.equal(a.action, 'wait');
  assert.equal(a.checkAt.getTime() - sun(17, 0).getTime(), 20 * 60 * 1000);
  const b = planDailyPush(paused, sun(21, 10));
  assert.equal(b.checkAt.toISOString(), sun(21, 15).toISOString());
});
test('horário do lembrete depois de fechar a loja nunca envia', () => {
  assert.equal(planDailyPush({ ...settings, push_daily_time: '21:50' }, sun(21, 55)).action, 'skip');
});
test('horário inválido ou ausente volta ao padrão 16:30', () => {
  assert.equal(dailyPushTime({}), '16:30');
  assert.equal(dailyPushTime({ push_daily_time: '25:99' }), '16:30');
  assert.equal(dailyPushTime({ push_daily_time: '09:15' }), '09:15');
});
test('virada de mês: "amanhã" de 30/11 é 01/12', () => {
  const p = planDailyPush(settings, new Date(Date.UTC(2026, 10, 30, 20, 0))); // segunda 30/11, fechada
  assert.equal(p.checkAt.toISOString(), '2026-12-01T03:05:00.000Z');
});
