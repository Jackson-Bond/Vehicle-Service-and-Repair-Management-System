import { Router } from 'express';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import requireRole from '../middleware/requireRole.js';
import { audit } from '../lib/audit.js';

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
        // deactivated staff only show for managers who ask (FR-25)
        ...(!(req.user.role === 'manager' && req.query.includeInactive === 'true') && { active: true }),
      },
      select: { userId: true, role: true, active: true, employeeCode: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    // send list to client
    res.json(members.map((m) => ({
      id: m.userId, name: m.user.name, role: m.role, active: m.active,
      ...(req.user.role === 'manager' && { employeeCode: m.employeeCode }),
    })));

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

    await audit(req.user, 'create', 'user', member.userId, { role: member.role });
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

// FR-25: edit name, role or PIN, and deactivate / reactivate (managers only)
router.patch('/:id', requireRole('manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
  const { name, role, pin, active } = req.body ?? {};

  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name is Required' });
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid Role' });
  if (pin !== undefined && !/^\d{6}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 6 digits' });
  if (active !== undefined && typeof active !== 'boolean') return res.status(400).json({ error: 'active must be true or false' });

  try {
    const member = await prisma.shopUser.findUnique({
      where: { shopId_userId: { shopId: req.user.shopId, userId: id } },
    });
    if (!member) return res.status(404).json({ error: 'User not found' });

    const losingManager = member.role === 'manager' && (role === 'technician' || active === false);
    if (losingManager) {
      if (id === req.user.userId) return res.status(400).json({ error: 'You cannot demote or deactivate your own account' });
      const managers = await prisma.shopUser.count({ where: { shopId: req.user.shopId, role: 'manager', active: true } });
      if (managers <= 1) return res.status(400).json({ error: 'The shop needs at least one active manager' });
    }

    // a deactivated technician must not keep open work they can no longer see
    if (active === false) {
      const open = await prisma.workOrder.count({
        where: { shopId: req.user.shopId, assignedTechnician: id, status: { notIn: ['completed', 'closed', 'declined', 'cancelled'] } },
      });
      if (open > 0) return res.status(409).json({ error: `Reassign this person's ${open} open work order(s) first` });
    }

    await prisma.$transaction(async (tx) => {
      if (name !== undefined || pin !== undefined) {
        await tx.user.update({
          where: { id },
          data: {
            ...(name !== undefined && { name: String(name).trim() }),
            ...(pin !== undefined && { pinHash: await bcrypt.hash(String(pin), 10) }),
          },
        });
      }
      if (role !== undefined || active !== undefined) {
        await tx.shopUser.update({
          where: { shopId_userId: { shopId: req.user.shopId, userId: id } },
          data: { ...(role !== undefined && { role }), ...(active !== undefined && { active }) },
        });
      }
      // never write the PIN itself to the log
      await audit(req.user, 'update', 'user', id, { name: name !== undefined, role, active, pinReset: pin !== undefined }, tx);
    });

    const updated = await prisma.shopUser.findUnique({
      where: { shopId_userId: { shopId: req.user.shopId, userId: id } },
      include: { user: { select: { name: true } } },
    });
    res.json({ id, name: updated.user.name, role: updated.role, active: updated.active, employeeCode: updated.employeeCode });
  } catch (err) {
    res.status(500).json({ error: 'Could not update user' });
  }
});

export default router;