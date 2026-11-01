import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { getSettings, isOpenAt } from '../services/store.js';
import { calculateComboDiscount } from '../services/promotions.js';
const router = Router();

router.get('/store', async (_req,res,next)=>{try{
  const settings=await getSettings(); const now=new Date(); const openNow=isOpenAt(now,settings) && settings.manual_closed!=='true';
  res.json({name:settings.store_name||'Açaí da Roça',whatsappNumber:settings.whatsapp_number||'',timezone:settings.timezone||'America/Sao_Paulo',openingDays:(settings.opening_days||'2,3,4,5,6,0').split(',').map(Number),openingTime:settings.opening_time||'13:30',closingTime:settings.closing_time||'22:00',minimumScheduleMinutes:Number(settings.minimum_schedule_minutes||30),maxFreeToppings:Number(settings.max_free_toppings||5),comboMinItems:Number(settings.combo_min_items||2),comboDiscountPercent:Number(settings.combo_discount_percent||5),estimatedMinutesMin:Number(settings.estimated_minutes_min||35),estimatedMinutesMax:Number(settings.estimated_minutes_max||55),manualClosed:settings.manual_closed==='true',openNow});
}catch(e){next(e)}});
router.get('/menu', async (_req,res,next)=>{try{
 const db=getPool(); const [p,s,o,z]=await Promise.all([
  db.query('SELECT id,name,description,active FROM products WHERE active=true ORDER BY sort_order,id'),
  db.query('SELECT id,product_id,name,price_cents AS price FROM product_sizes WHERE active=true ORDER BY sort_order,id'),
  db.query('SELECT id,name,category,price_cents AS price FROM options WHERE active=true ORDER BY sort_order,id'),
  db.query('SELECT id,name,fee_cents AS fee FROM delivery_zones WHERE active=true ORDER BY name')
 ]);
 res.json({products:p.rows.map(product=>({...product,sizes:s.rows.filter(x=>x.product_id===product.id)})),options:o.rows,zones:z.rows});
}catch(e){next(e)}});

router.get('/coupons/validate', async (req,res,next)=>{try{
 const code=String(req.query.code||'').trim().toUpperCase(),subtotal=Number(req.query.subtotalCents);
 if(!code||!Number.isInteger(subtotal)||subtotal<0)return res.status(400).json({error:'Informe um cupom e um subtotal válido.'});
 const {rows}=await getPool().query('SELECT code,discount_type,discount_value,min_subtotal_cents FROM coupons WHERE code=$1 AND active=true',[code]);
 if(!rows.length)return res.status(404).json({error:'Cupom inválido ou indisponível.'});
 const c=rows[0];const settings=await getSettings();const comboCount=Number(req.query.itemCount||0);const comboDiscount=calculateComboDiscount(subtotal,comboCount,Number(settings.combo_min_items||2),Number(settings.combo_discount_percent||5));const couponBase=Math.max(0,subtotal-comboDiscount);if(couponBase<Number(c.min_subtotal_cents))return res.status(400).json({error:`O pedido mínimo para este cupom é ${(Number(c.min_subtotal_cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`});
 const discountCents=c.discount_type==='percent'?Math.floor(couponBase*Math.min(100,Number(c.discount_value))/100):Math.min(couponBase,Number(c.discount_value));
 res.json({code:c.code,discountCents,comboDiscountCents:comboDiscount,discountType:c.discount_type,discountValue:c.discount_value});
}catch(e){next(e)}});

router.get('/reviews', async (_req,res,next)=>{try{const {rows}=await getPool().query('SELECT id,customer_name AS name,rating,comment,created_at FROM reviews WHERE approved=true ORDER BY created_at DESC LIMIT 30');res.json(rows)}catch(e){next(e)}});
router.post('/reviews', async (req,res,next)=>{try{
 const name=String(req.body.name||'').trim().slice(0,100), comment=String(req.body.comment||'').trim().slice(0,800), rating=Number(req.body.rating);
 if(name.length<2||comment.length<5||!Number.isInteger(rating)||rating<1||rating>5) return res.status(400).json({error:'Informe nome, comentário e nota de 1 a 5.'});
 await getPool().query('INSERT INTO reviews(customer_name,rating,comment) VALUES($1,$2,$3)',[name,rating,comment]);res.status(201).json({message:'Avaliação enviada para análise. Obrigado!'});
}catch(e){next(e)}});
export default router;
