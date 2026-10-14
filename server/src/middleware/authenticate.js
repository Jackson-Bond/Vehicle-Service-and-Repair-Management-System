import jwt from 'jsonwebtoken';

export default function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    // { userId, shopId, role, iat, exp }
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    res.status(401).json({ error: expired ? 'Session expired' : 'Invalid token' });
  }
}