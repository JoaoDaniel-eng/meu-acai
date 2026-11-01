import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { getSettings, isOpenAt } from '../services/store.js';
import { calculateComboDiscount } from '../services/promotions.js';
const router=Router();
import jwt from 'jsonwebtoken';
function optionalCustomerId(req){try{const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const p=jwt.verify(raw,process.env.JWT_SECRET);return p.type==='customer'?Number(p.sub):null}catch{return null}}
const cents = n => Number(n||0);
function makeCode(){return 'AR-'+Math.random().toString(36).slice(2,8).toUpperCase()}
router.post('/orders', async (req,res,next)=>{try{
 const {customerName,phone,address,zoneId,notes='',scheduledFor=null,paymentMethod,needsChange='no',changeFor='',couponCode='',items}=req.body||{};
 const name=String(customerName||'').trim(), customerPhone=String(phone||'').trim(), addr=String(address||'').trim();
 if(name.length<2||name.length>120||customerPhone.replace(/\D/g,'').length<10||customerPhone.replace(/\D/g,'').length>15||addr.length<6||!['Pix','Dinheiro','Cartão de crédito','Cartão de débito'].includes(paymentMethod)||!Array.isArray(items)||items.length<1||items.length>30) return res.status(400).json({error:'Confira nome, telefone, endereço, pagamento e itens do pedido.'});
 const cashChangeFor=paymentMethod==='Dinheiro'&&needsChange==='yes'?String(changeFor).trim():null;
 if(paymentMethod==='Dinheiro'&&!['yes','no'].includes(needsChange))return res.status(400).json({error:'Informe se precisa de troco. Essa informação é obrigatória para pagamento em dinheiro.'});
 if(paymentMethod==='Dinheiro'&&needsChange==='yes'&&(!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(cashChangeFor)||Number(cashChangeFor.replace(',','.'))<=0))return res.status(400).json({error:'Informe um valor válido para o troco.'});
 const db=getPool(), settings=await getSettings();
 const accountId=optionalCustomerId(req);if(accountId){const account=await db.query('SELECT phone FROM customers WHERE id=$1',[accountId]);if(!account.rowCount||account.rows[0].phone!==customerPhone.replace(/\D/g,''))return res.status(400).json({error:'O telefone do pedido precisa ser o mesmo da sua conta.'});}
 if(!Number.isInteger(Number(zoneId))||Number(zoneId)<1)return res.status(400).json({error:'Selecione um bairro válido.'});
 const zoneResult=await db.query('SELECT id,name,fee_cents FROM delivery_zones WHERE id=$1 AND active=true',[Number(zoneId)]);
 if(!zoneResult.rowCount) return res.status(400).json({error:'Bairro não atendido no momento. Escolha uma opção disponível.'});
 const zone=zoneResult.rows[0];
 let schedule=null;
 if(scheduledFor){schedule=new Date(scheduledFor);if(Number.isNaN(schedule.getTime()))return res.status(400).json({error:'Data de agendamento inválida.'});
  const minMinutes=Number(settings.minimum_schedule_minutes||30);if(schedule.getTime()<Date.now()+minMinutes*60000)return res.status(400).json({error:`Agende com pelo menos ${minMinutes} minutos de antecedência.`});
  if(!isOpenAt(schedule,settings))return res.status(400).json({error:`O horário agendado precisa estar dentro do funcionamento (${settings.openingTime||'13:30'} às ${settings.closingTime||'22:00'}, de terça a domingo).`});
 } else if(settings.manual_closed==='true'||!isOpenAt(new Date(),settings)) return res.status(409).json({error:'A loja está fechada para pedidos imediatos. Você pode agendar para outro horário.'});
 if(!items.every(item=>item&&typeof item==='object'&&!Array.isArray(item)))return res.status(400).json({error:'Formato de item inválido.'});
 const sizeIds=[...new Set(items.map(i=>Number(i.sizeId)))];
 if(sizeIds.some(id=>!Number.isInteger(id)||id<1)||items.some(item=>Array.isArray(item.optionIds)&&item.optionIds.some(id=>!Number.isInteger(Number(id))||Number(id)<1))||items.some(item=>item.optionIds!==undefined&&!Array.isArray(item.optionIds)))return res.status(400).json({error:'Tamanho ou adicional inválido.'});
 const sizes=(await db.query('SELECT s.id,s.name,s.price_cents,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id WHERE s.id=ANY($1::int[]) AND s.active=true AND p.active=true',[sizeIds])).rows;
 if(sizes.length!==sizeIds.length)return res.status(400).json({error:'Um dos tamanhos escolhidos não está disponível.'});
 const optionIds=[...new Set(items.flatMap(i=>Array.isArray(i.optionIds)?i.optionIds.map(Number):[]))];
 const options=optionIds.length?(await db.query('SELECT id,name,category,price_cents FROM options WHERE id=ANY($1::int[]) AND active=true',[optionIds])).rows:[];
 if(options.length!==optionIds.length)return res.status(400).json({error:'Um dos adicionais não está disponível.'});
 const optionMap=new Map(options.map(o=>[o.id,o]));
 const maxToppings=Number(settings.max_free_toppings||5);
 let subtotal=0;const normalized=[];let itemCount=0;
 for(const item of items){
  const size=sizes.find(s=>s.id===Number(item.sizeId));const qty=Number(item.quantity);const ids=Array.isArray(item.optionIds)?[...new Set(item.optionIds.map(Number))]:[];
  if(!Number.isInteger(qty)||qty<1||qty>20||ids.length>30)return res.status(400).json({error:'Quantidade inválida (1 a 20 por item).'});
  const selected=ids.map(id=>optionMap.get(id));if(selected.some(x=>!x))return res.status(400).json({error:'Adicional inválido.'});
  if(selected.filter(x=>x.category==='topping').length>maxToppings)return res.status(400).json({error:`Escolha no máximo ${maxToppings} acompanhamentos grátis por item.`});
  if(selected.filter(x=>x.category==='syrup').length>1)return res.status(400).json({error:'Escolha no máximo uma calda por item.'});
  const extras=selected.reduce((sum,x)=>sum+cents(x.price_cents),0);const unit=cents(size.price_cents)+extras;subtotal+=unit*qty;itemCount+=qty;
  normalized.push({product:size.product_name,sizeId:size.id,size:size.name,quantity:qty,options:selected.map(o=>({id:o.id,name:o.name,category:o.category,priceCents:cents(o.price_cents)})),unitPriceCents:unit,lineTotalCents:unit*qty});
 }
 if(subtotal>2000000)return res.status(400).json({error:'O valor do pedido ultrapassa o limite permitido. Divida em dois pedidos.'});
 const comboDiscount=calculateComboDiscount(subtotal,itemCount,Number(settings.combo_min_items||2),Number(settings.combo_discount_percent||5));
 let discount=0, appliedCoupon=null;
 const normalizedCoupon=String(couponCode||'').trim().toUpperCase();
 if(normalizedCoupon){
  const c=await db.query('SELECT code,discount_type,discount_value,min_subtotal_cents FROM coupons WHERE code=$1 AND active=true',[normalizedCoupon]);
  if(!c.rowCount)return res.status(400).json({error:'Cupom inválido ou indisponível.'});
  appliedCoupon=c.rows[0];
  if(subtotal-comboDiscount<Number(appliedCoupon.min_subtotal_cents))return res.status(400).json({error:`Este cupom exige um subtotal mínimo de ${ (Number(appliedCoupon.min_subtotal_cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }.`});
  discount=appliedCoupon.discount_type==='percent'?Math.floor((subtotal-comboDiscount)*Math.min(100,Number(appliedCoupon.discount_value))/100):Math.min(subtotal-comboDiscount,Number(appliedCoupon.discount_value));
 }
 const fee=cents(zone.fee_cents), total=subtotal-comboDiscount-discount+fee;const estimatedMin=Number(settings.estimated_minutes_min||35),estimatedMax=Math.max(estimatedMin,Number(settings.estimated_minutes_max||55));let orderCode;
 for(let i=0;i<5;i++){orderCode=makeCode();const exists=await db.query('SELECT 1 FROM orders WHERE order_code=$1',[orderCode]);if(!exists.rowCount)break;}
 const result=await db.query(`INSERT INTO orders(customer_id,order_code,customer_name,customer_phone,address,neighborhood,notes,scheduled_for,payment_method,change_for,coupon_code,discount_cents,combo_discount_cents,estimated_minutes_min,estimated_minutes_max,items,subtotal_cents,delivery_fee_cents,total_cents)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,order_code,created_at`,[accountId,orderCode,name,customerPhone,addr,zone.name,String(notes).trim().slice(0,1000),schedule,paymentMethod,cashChangeFor,appliedCoupon?.code||null,discount,comboDiscount,estimatedMin,estimatedMax,JSON.stringify(normalized),subtotal,fee,total]);
 res.status(201).json({id:result.rows[0].id,orderCode,createdAt:result.rows[0].created_at,customerName:name,phone:customerPhone,address:addr,neighborhood:zone.name,notes:String(notes).trim(),scheduledFor:schedule,paymentMethod,changeFor:cashChangeFor,items:normalized,subtotalCents:subtotal,discountCents:discount,comboDiscountCents:comboDiscount,couponCode:appliedCoupon?.code||null,estimatedMinutesMin:estimatedMin,estimatedMinutesMax:estimatedMax,deliveryFeeCents:fee,totalCents:total,whatsappNumber:String(settings.whatsapp_number||'').replace(/\D/g,'')});
}catch(e){next(e)}});

// Consulta pública protegida por código do pedido + telefone cadastrado.
router.get('/orders/track',async(req,res,next)=>{try{
 const code=String(req.query.code||'').trim().toUpperCase(), phone=String(req.query.phone||'').replace(/\D/g,'');
 if(!/^AR-[A-Z0-9]{6}$/.test(code)||phone.length<10)return res.status(400).json({error:'Informe o código do pedido e o telefone usado na compra.'});
 const r=await getPool().query("SELECT order_code,customer_name,customer_phone,address,neighborhood,notes,scheduled_for,payment_method,change_for,coupon_code,discount_cents,combo_discount_cents,estimated_minutes_min,estimated_minutes_max,items,subtotal_cents,delivery_fee_cents,total_cents,status,created_at,updated_at FROM orders WHERE order_code=$1 AND regexp_replace(customer_phone,'[^0-9]','','g')=$2",[code,phone]);
 if(!r.rowCount)return res.status(404).json({error:'Pedido não encontrado. Confira o código e o telefone.'});
 const o=r.rows[0];const loyalty=await getPool().query("SELECT COALESCE(SUM(points),0)::int AS balance FROM loyalty_points WHERE regexp_replace(customer_phone,'[^0-9]','','g')=$1",[phone]);const earned=await getPool().query('SELECT points FROM loyalty_points WHERE order_id=(SELECT id FROM orders WHERE order_code=$1)',[code]);res.json({orderCode:o.order_code,customerName:o.customer_name,phone:o.customer_phone,address:o.address,neighborhood:o.neighborhood,notes:o.notes,scheduledFor:o.scheduled_for,paymentMethod:o.payment_method,changeFor:o.change_for,items:o.items,subtotalCents:o.subtotal_cents,discountCents:o.discount_cents||0,comboDiscountCents:o.combo_discount_cents||0,estimatedMinutesMin:o.estimated_minutes_min||35,estimatedMinutesMax:o.estimated_minutes_max||55,loyaltyBalance:loyalty.rows[0].balance,earnedPoints:earned.rows[0]?.points||0,couponCode:o.coupon_code,deliveryFeeCents:o.delivery_fee_cents,totalCents:o.total_cents,status:o.status,createdAt:o.created_at,updatedAt:o.updated_at,canEdit:['new','preparing'].includes(o.status),canCancel:['new','preparing'].includes(o.status)});
}catch(e){next(e)}});
router.patch('/orders/:code/customer',async(req,res,next)=>{try{
 const code=String(req.params.code||'').toUpperCase(),phone=String(req.body.phone||'').replace(/\D/g,'');
 const db=getPool();const found=await db.query("SELECT * FROM orders WHERE order_code=$1 AND regexp_replace(customer_phone, '[^0-9]', '', 'g')=$2 FOR UPDATE",[code,phone]);
 if(!found.rowCount)return res.status(404).json({error:'Pedido não encontrado. Confira o código e o telefone.'});
 const o=found.rows[0];if(!['new','preparing'].includes(o.status))return res.status(409).json({error:'Este pedido não pode mais ser editado porque já avançou no preparo ou na entrega.'});
 const items=Array.isArray(req.body.items)?req.body.items:null;if(!items||!items.length||items.length>30)return res.status(400).json({error:'O pedido precisa ter pelo menos um item.'});
 const old=o.items;const normalized=[];let subtotal=0;
 if(!items.every(edit=>edit&&typeof edit==='object'&&!Array.isArray(edit)))return res.status(400).json({error:'Formato de item inválido.'});
 const requested=items.map(edit=>({edit,idx:Number(edit.index),qty:Number(edit.quantity),sizeId:Number(edit.sizeId),optionIds:Array.isArray(edit.optionIds)?[...new Set(edit.optionIds.map(Number))]:[]}));
 if(requested.some(x=>x.edit.optionIds!==undefined&&!Array.isArray(x.edit.optionIds))||requested.some(x=>x.optionIds.some(id=>!Number.isInteger(id)||id<1))||new Set(requested.map(x=>x.idx)).size!==requested.length)return res.status(400).json({error:'Itens ou adicionais inválidos.'});
 if(requested.some(x=>!Number.isInteger(x.idx)||!old[x.idx]||!Number.isInteger(x.qty)||x.qty<0||x.qty>20||(x.qty>0&&(!Number.isInteger(x.sizeId)||x.sizeId<1))))return res.status(400).json({error:'Confira quantidade, tamanho e itens selecionados.'});
 const activeSizeIds=[...new Set(requested.filter(x=>x.qty>0).map(x=>x.sizeId))];
 const sizeRows=activeSizeIds.length?(await db.query('SELECT s.id,s.name,s.price_cents,p.name AS product_name FROM product_sizes s JOIN products p ON p.id=s.product_id WHERE s.id=ANY($1::int[]) AND s.active=true AND p.active=true',[activeSizeIds])).rows:[];
 if(sizeRows.length!==activeSizeIds.length)return res.status(400).json({error:'Um dos tamanhos escolhidos não está mais disponível.'});
 const allOptionIds=[...new Set(requested.filter(x=>x.qty>0).flatMap(x=>x.optionIds))];
 const optionRows=allOptionIds.length?(await db.query('SELECT id,name,category,price_cents FROM options WHERE id=ANY($1::int[]) AND active=true',[allOptionIds])).rows:[];
 if(optionRows.length!==allOptionIds.length)return res.status(400).json({error:'Uma das opções escolhidas não está mais disponível.'});
 const maxToppings=Number((await getSettings()).max_free_toppings||5);
 for(const x of requested){if(x.qty===0)continue;const size=sizeRows.find(z=>z.id===x.sizeId);const selected=x.optionIds.map(id=>optionRows.find(opt=>opt.id===id));if(selected.some(opt=>!opt))return res.status(400).json({error:'Opção inválida.'});if(selected.filter(opt=>opt.category==='topping').length>maxToppings)return res.status(400).json({error:`Escolha no máximo ${maxToppings} acompanhamentos por açaí.`});if(selected.filter(opt=>opt.category==='syrup').length>1)return res.status(400).json({error:'Escolha apenas uma calda por açaí.'});const unit=Number(size.price_cents)+selected.reduce((sum,opt)=>sum+Number(opt.price_cents||0),0);const item={product:size.product_name,sizeId:size.id,size:size.name,quantity:x.qty,options:selected.map(opt=>({id:opt.id,name:opt.name,category:opt.category,priceCents:Number(opt.price_cents||0)})),unitPriceCents:unit,lineTotalCents:unit*x.qty};subtotal+=item.lineTotalCents;normalized.push(item)}
 if(!normalized.length)return res.status(400).json({error:'O pedido precisa ter pelo menos um item.'});
 if(subtotal>2000000)return res.status(400).json({error:'O valor do pedido ultrapassa o limite permitido.'});
 const name=String(req.body.customerName||o.customer_name).trim(),address=String(req.body.address||o.address).trim(),notes=String(req.body.notes??o.notes).trim().slice(0,1000);
 if(name.length<2||name.length>120||address.length<6||address.length>400)return res.status(400).json({error:'Confira o nome e o endereço.'});
 const zoneId=Number(req.body.zoneId||0);const zone=zoneId?await db.query('SELECT name,fee_cents FROM delivery_zones WHERE id=$1 AND active=true',[zoneId]):null;
 if(zoneId&&(!zone||!zone.rowCount))return res.status(400).json({error:'Bairro não disponível. Escolha outro.'});
 const neighborhood=zone?.rows[0]?.name||o.neighborhood,fee=zone?.rows[0]?.fee_cents??o.delivery_fee_cents;
 const scheduled=req.body.scheduledFor===undefined?o.scheduled_for:(req.body.scheduledFor?new Date(req.body.scheduledFor):null);
 if(scheduled&&Number.isNaN(new Date(scheduled).getTime()))return res.status(400).json({error:'Data de agendamento inválida.'});
 const editSettings=await getSettings();const editedCount=normalized.reduce((sum,item)=>sum+item.quantity,0),comboDiscount=calculateComboDiscount(subtotal,editedCount,Number(editSettings.combo_min_items||2),Number(editSettings.combo_discount_percent||5));
 let discount=0,couponCode=o.coupon_code||null;
 if(couponCode){const c=await db.query('SELECT code,discount_type,discount_value,min_subtotal_cents FROM coupons WHERE code=$1 AND active=true',[couponCode]);if(c.rowCount&&subtotal-comboDiscount>=Number(c.rows[0].min_subtotal_cents)){const cp=c.rows[0],base=subtotal-comboDiscount;discount=cp.discount_type==='percent'?Math.floor(base*Math.min(100,Number(cp.discount_value))/100):Math.min(base,Number(cp.discount_value));}else couponCode=null;}
 const total=subtotal-comboDiscount-discount+Number(fee);const updated=await db.query(`UPDATE orders SET customer_name=$1,address=$2,neighborhood=$3,notes=$4,scheduled_for=$5,items=$6,subtotal_cents=$7,delivery_fee_cents=$8,discount_cents=$9,coupon_code=$10,combo_discount_cents=$11,total_cents=$12,updated_at=NOW() WHERE id=$13 RETURNING order_code,status`,[name,address,neighborhood,notes,scheduled,JSON.stringify(normalized),subtotal,fee,discount,couponCode,comboDiscount,total,o.id]);
 const settings=await getSettings();const loyalty=await db.query("SELECT COALESCE(SUM(points),0)::int AS balance FROM loyalty_points WHERE regexp_replace(customer_phone,'[^0-9]','','g')=$1",[phone]);res.json({ok:true,loyaltyBalance:loyalty.rows[0].balance,canEdit:['new','preparing'].includes(updated.rows[0].status),canCancel:['new','preparing'].includes(updated.rows[0].status),orderCode:code,status:updated.rows[0].status,customerName:name,phone:o.customer_phone,address,neighborhood,notes,scheduledFor:scheduled,paymentMethod:o.payment_method,changeFor:o.change_for,items:normalized,subtotalCents:subtotal,discountCents:discount,comboDiscountCents:comboDiscount,couponCode,estimatedMinutesMin:o.estimated_minutes_min||35,estimatedMinutesMax:o.estimated_minutes_max||55,deliveryFeeCents:fee,totalCents:total,whatsappNumber:String(settings.whatsapp_number||'').replace(/\D/g,'')});
}catch(e){next(e)}});
router.post('/orders/:code/cancel',async(req,res,next)=>{try{
 const code=String(req.params.code||'').toUpperCase(),phone=String(req.body.phone||'').replace(/\D/g,'');
 const r=await getPool().query("UPDATE orders SET status='cancelled',updated_at=NOW() WHERE order_code=$1 AND regexp_replace(customer_phone,'[^0-9]','','g')=$2 AND status IN ('new','preparing') RETURNING order_code,customer_name,customer_phone,total_cents",[code,phone]);
 if(!r.rowCount)return res.status(409).json({error:'Não foi possível cancelar. Confira os dados ou entre em contato com a loja.'});const settings=await getSettings();res.json({ok:true,...r.rows[0],whatsappNumber:String(settings.whatsapp_number||'').replace(/\D/g,'')});
}catch(e){next(e)}});

export default router;
