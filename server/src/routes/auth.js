import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const router = Router();

router.post('/login', async (req, res) => {

  const { shopId, employeeCode, pin } = req.body ?? {};
  const code = Number(employeeCode);

  // check validity
  if (!shopId || !Number.isInteger(code) || !pin) {
    return res.status(400).json({ error: 'shopId, employeeCode, and pin are required' });
  }

  // check if employee belongs to shop
  const membership = await prisma.shopUser.findUnique({
    where: { shopId_employeeCode: { shopId: Number(shopId), employeeCode: code } },
    include: { user: true },
  });

  // check if membership exists and pin is correct
  const valid = membership && (await bcrypt.compare(String(pin), membership.user.pinHash));
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // create a signed JWT login token {user ID, shop ID, role} ####### VERY IMPORTANT #######
  const token = jwt.sign(
    { userId: membership.userId, shopId: membership.shopId, role: membership.role },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );

  res.json({ token, role: membership.role, name: membership.user.name });
});

export default router;