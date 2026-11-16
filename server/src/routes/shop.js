import { Router } from 'express';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';
import { audit } from '../lib/audit.js';

// shop settings: sales tax used by estimates and invoices
const router = Router();

router.get('/', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { id: req.user.shopId },
    select: { id: true, name: true, taxRate: true },
  });
  res.json({ ...shop, taxRate: Number(shop.taxRate) });
});

router.patch('/', requireRole('manager'), async (req, res) => {
  const rate = Number(req.body?.taxRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.25) {
    return res.status(400).json({ error: 'Tax rate must be between 0 and 0.25 (for example 0.0825)' });
  }
  try {
    const shop = await prisma.$transaction(async (tx) => {
      const row = await tx.shop.update({ where: { id: req.user.shopId }, data: { taxRate: rate } });
      await audit(req.user, 'update', 'shop', row.id, { taxRate: rate }, tx);
      return row;
    });
    res.json({ id: shop.id, name: shop.name, taxRate: Number(shop.taxRate) });
  } catch (err) {
    res.status(500).json({ error: 'Could not save settings' });
  }
});

export default router;
