import jwt from 'jsonwebtoken';
export function requireAdmin(req,res,next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  if (!token) return res.status(401).json({error:'Faça login para continuar.'});
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET inválido');
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { return res.status(401).json({error:'Sessão inválida. Entre novamente.'}); }
}
