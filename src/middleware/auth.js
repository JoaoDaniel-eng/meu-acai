import jwt from 'jsonwebtoken';
// Só aceita tokens emitidos pelo login do painel (type 'admin'). Tokens de cliente usam o mesmo
// JWT_SECRET, então sem essa conferência uma conta de cliente conseguiria entrar na API do painel.
export function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token)
    return res.status(401).json({ error: 'Faça login para continuar.' });
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
      throw new Error('JWT_SECRET inválido');
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.type !== 'admin' || !payload.adminId)
      throw new Error('Token não é de administrador');
    req.admin = payload;
    next();
  }
  catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
  }
}
