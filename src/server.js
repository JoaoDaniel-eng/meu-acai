import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import publicRoutes from './routes/public.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import customerRoutes from './routes/customers.js';
import { initializeDatabase } from './db/init.js';

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express(),PORT=Number(process.env.PORT||3000);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');next()});
app.use(express.json({limit:'10mb'}));app.use(express.urlencoded({extended:false,limit:'100kb'}));
app.use('/api',publicRoutes);app.use('/api',orderRoutes);app.use('/api',customerRoutes);app.use('/api/admin',adminRoutes);
app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'..','public','admin.html')));
app.use(express.static(path.join(__dirname,'..','public')));
app.get('/api/health',(_req,res)=>res.json({status:'ok',app:'Açaí da Roça'}));
app.use((req,res)=>req.path.startsWith('/api/')?res.status(404).json({error:'Rota não encontrada.'}):res.status(404).sendFile(path.join(__dirname,'..','public','404.html')));
app.use((err,_req,res,_next)=>{console.error(err);if(err.code==='23503')return res.status(400).json({error:'Não foi possível concluir por causa de uma referência inválida.'});res.status(500).json({error:'Ocorreu um erro interno. Tente novamente.'})});
async function start(){
 if(process.env.DATABASE_URL){try{await initializeDatabase()}catch(error){console.error('Falha ao inicializar o banco:',error.message);if(process.env.NODE_ENV==='production')process.exit(1)}}else console.warn('DATABASE_URL ausente: APIs de dados não estarão disponíveis. Configure o .env.');
 app.listen(PORT,()=>console.log(`Açaí da Roça disponível na porta ${PORT}`));
}
start();
