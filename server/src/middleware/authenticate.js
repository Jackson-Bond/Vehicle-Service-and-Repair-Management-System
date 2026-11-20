import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

export const SESSION_MINUTES = 30;
export const RENEWED_TOKEN_HEADER = 'X-Session-Token';
const RENEW_WHEN_SECONDS_LEFT = (SESSION_MINUTES - 5) * 60;

// The one place login tokens are made, so login and renewal always match
export function signToken({ userId, shopId, role }) {
  return jwt.sign({ userId, shopId, role }, process.env.JWT_SECRET, { expiresIn: `${SESSION_MINUTES}m` });
}

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

    // NFR-03: the session ends after 30 minutes of inactivity, not 30 minutes after login.
    // Once a token is more than 5 minutes old, send a fresh one back for the client to use.
    if (req.user.exp - Date.now() / 1000 < RENEW_WHEN_SECONDS_LEFT) {
      const { userId, shopId } = req.user;
      res.set(RENEWED_TOKEN_HEADER, signToken({ userId, shopId, role: member.role }));
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Could not verify account' });
  }
}