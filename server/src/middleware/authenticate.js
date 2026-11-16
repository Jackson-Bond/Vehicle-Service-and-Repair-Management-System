import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

export default async function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    // { userId, shopId, role, iat, exp }
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({ error: expired ? 'Session expired' : 'Invalid token' });
  }

  try {
    // FR-25: a deactivated account loses access immediately, not when its token expires
    const member = await prisma.shopUser.findUnique({
      where: { shopId_userId: { shopId: req.user.shopId, userId: req.user.userId } },
      select: { active: true, role: true },
    });
    if (!member || !member.active) return res.status(401).json({ error: 'Account is not active' });
    req.user.role = member.role;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Could not verify account' });
  }
}
