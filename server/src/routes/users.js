import { Router } from 'express';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import requireRole from '../middleware/requireRole.js';

const router = Router();
const ROLES = ['technician', 'manager'];

router.get('/', async (req, res) => {
  try {
    // fetch users from database
    const members = await prisma.shopUser.findMany({
      where: {
        // limit to users in current shop
        shopId: req.user.shopId,
        ...(req.query.role && { role: String(req.query.role) }),
      },
      select: { userId: true, role: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    // send list to client
    res.json(members.map((m) => ({ id: m.userId, name: m.user.name, role: m.role })));

  } catch (err) {
    res.status(500).json({ error: 'Could not load users' });
  }
});

// add user to shop (requires manager role)
router.post('/', requireRole('manager'), async (req, res) => {
  const { name, pin, role } = req.body ?? {};

  // validate fields
  if (!name?.trim()) return res.status(400).json({ error: 'Name is Required' });

  if (!/^\d{6}$/.test(String(pin ?? ''))) {
    return res.status(400).json({ error: 'PIN must be 6 digits' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid Role' });

  try {
    // hash the pin for database storage
    const pinHash = await bcrypt.hash(String(pin), 10);

    const member = await prisma.$transaction(async (transaction) => {
      const shop = await transaction.shop.update({
        where: { id: req.user.shopId },
        // increment employee number automatically
        data: { nextEmployeeNumber: { increment: 1 } },
        select: { nextEmployeeNumber: true },
      });
      const code = shop.nextEmployeeNumber - 1;

      const user = await transaction.user.create({ data: { name: name.trim(), pinHash } });
      return transaction.shopUser.create({
        data: { shopId: req.user.shopId, userId: user.id, role, employeeCode: code },
      });
    });

    res.status(201).json({
      id: member.userId,
      name: name.trim(),
      role: member.role,
      employeeCode: member.employeeCode,
    });

  } catch (err) {
    res.status(500).json({ error: 'Could not Create User' });
  }
});

export default router;