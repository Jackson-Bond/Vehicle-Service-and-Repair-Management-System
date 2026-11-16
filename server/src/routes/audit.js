import { Router } from 'express';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';

// FR-26: managers can read the audit trail (it is never edited or deleted)
const router = Router();
router.use(requireRole('manager'));

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        shopId: req.user.shopId,
        ...(req.query.entityType && { entityType: String(req.query.entityType) }),
        ...(req.query.entityId && Number.isInteger(Number(req.query.entityId)) && { entityId: Number(req.query.entityId) }),
        ...(req.query.action && { action: String(req.query.action) }),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true },
    });
    const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
    res.json(rows.map((r) => ({ ...r, userName: names[r.userId] ?? 'Unknown' })));
  } catch (err) {
    res.status(500).json({ error: 'Could not load audit log' });
  }
});

export default router;
