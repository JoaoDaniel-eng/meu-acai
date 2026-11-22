
let marketingData = {customers:[], campaigns:[], audience:'all'};
async function loadMarketing() {
  const audience = document.querySelector('#marketing-form [name="audience"]').value || 'all';
  const [a,c] = await Promise.all([api('/marketing/audience?audience='+encodeURIComponent(audience)),api('/marketing/campaigns')]);
  marketingData.customers=a.customers||[]; marketingData.campaigns=c||[]; marketingData.audience=audience;
  $('#marketing-stats').innerHTML = `<article class="stat-card"><span>Clientes neste público</span><strong>${a.count}</strong><small>Até 500 contatos exibidos</small></article><article class="stat-card"><span>Com notificações ativadas</span><strong>${a.pushCount}</strong><small>Podem receber ofertas pelo navegador</small></article><article class="stat-card"><span>Campanhas salvas</span><strong>${c.length}</strong><small>Histórico recente</small></article>`;
  $('#marketing-contacts').innerHTML = marketingData.customers.length ? marketingData.customers.map(x=>{const camp=marketingData.campaigns[0];const msg=camp?`Olá, ${x.name.split(/\s+/)[0]}! ${camp.message}${camp.offer_price?' Oferta: '+camp.offer_price+'.':''} Acesse: ${location.origin}${camp.offer_url||'/#cardapio'}`:`Olá! Temos novidades no Açaí da Roça! Acesse nosso cardápio: ${location.origin}/#cardapio`;return `<div class="customer-admin-row"><div><strong>${esc(x.name)}</strong><small>${esc(x.phone)}</small></div><a class="button button-small button-green" target="_blank" rel="noopener noreferrer" href="https://wa.me/55${String(x.phone).replace(/\D/g,'')}?text=${encodeURIComponent(msg)}">Abrir WhatsApp</a></div>`}).join('') : '<p class="muted">Nenhum cliente neste público.</p>';
  $('#marketing-campaigns').innerHTML = c.length ? c.map(x=>`<div class="customer-admin-row"><div><strong>${esc(x.title)}</strong><small>${esc(x.message)} · ${new Date(x.created_at).toLocaleString('pt-BR')} · ${x.push_sent||0} notificações enviadas</small></div><button class="button button-small button-primary" type="button" data-marketing-push="${x.id}">📲 Enviar push</button></div>`).join('') : '<p class="muted">Nenhuma campanha criada ainda.</p>';
  document.querySelectorAll('[data-marketing-push]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Enviar esta oferta para os clientes deste segmento que ativaram notificações?'))return; b.disabled=true;try{const r=await api(`/marketing/campaigns/${b.dataset.marketingPush}/push`,{method:'POST'});say(`${r.sent} notificações enviadas. ${r.failed} falharam; ${r.targeted} dispositivos selecionados.`);await loadMarketing()}catch(e){say(e.message);b.disabled=false}}));
}
$('#marketing-form').addEventListener('submit',async e=>{
 e.preventDefault(); const f=new FormData(e.currentTarget);
 const payload=Object.fromEntries(f.entries());
 try{await api('/marketing/campaigns',{method:'POST',body:JSON.stringify(payload)});say('Campanha salva! Agora você pode enviar push ou abrir os contatos no WhatsApp.');e.currentTarget.reset();e.currentTarget.querySelector('[name="offerUrl"]').value='/#cardapio';await loadMarketing()}
 catch(err){say(err.message)}
});
$('#marketing-form [name="audience"]').addEventListener('change',()=>loadMarketing().catch(e=>say(e.message)));
$('#marketing-refresh').addEventListener('click',()=>loadMarketing().catch(e=>say(e.message)));

// Salvar e enviar numa tacada só (o botão 📲 Enviar push da lista de campanhas continua existindo para reenviar depois).
$('#marketing-send-now').addEventListener('click', async e => {
  const form = $('#marketing-form'), btn = e.currentTarget;
  if (!form.reportValidity()) return;
  const stats = document.querySelector('#marketing-stats strong:nth-of-type(1)');
  if (!confirm('Salvar esta oferta e enviar agora para os clientes que ativaram as notificações?')) return;
  btn.disabled = true;
  let saved = null;
  try {
    saved = await api('/marketing/campaigns', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const r = await api(`/marketing/campaigns/${saved.id}/push`, { method: 'POST' });
    say(r.targeted ? `📲 Oferta enviada: ${r.sent} notificação(ões) entregue(s)${r.failed ? `, ${r.failed} falharam` : ''}.` : 'Campanha salva, mas ainda não há aparelhos com notificações ativadas para receber.');
    form.reset();
    form.querySelector('[name="offerUrl"]').value = '/#cardapio';
    await loadMarketing();
  }
  catch (err) { say(saved ? `Campanha salva, mas o envio falhou: ${err.message}` : err.message); if (saved) await loadMarketing().catch(() => { }); }
  finally { btn.disabled = false; }
});
