import { Router } from 'express';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';

const router = Router();

router.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const limit = Math.min(Number(req.query.limit) || 50, 50);

  try {
    const customers = await prisma.customer.findMany({
      where: {
        // always from the token
        shopId: req.user.shopId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: 'Could not load customers' });
  }
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: Number(req.params.id), shopId: req.user.shopId },
  });
  if (!customer) return res.status(404).json({ error: 'Not found' });
  res.json(customer);
});

router.get('/:id/vehicles', async (req, res) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: Number(req.params.id), shopId: req.user.shopId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const links = await prisma.customerVehicle.findMany({
      where: { customerId: customer.id },
      include: { vehicle: true },
    });
    res.json(links.map((l) => l.vehicle));
  } catch (err) {
    res.status(500).json({ error: 'Could not load vehicles' });
  }
});

router.post('/', async (req, res) => {
  const { name, phone, email, preferredContactMethod } = req.body ?? {};

  if (!name?.trim()) return res.status(400).json({ error: 'Name is Required' });
  if (preferredContactMethod && !CONTACT_METHODS.includes(preferredContactMethod)) {
    return res.status(400).json({ error: 'Invalid contact method' });
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        // from the token, never the body
        shopId: req.user.shopId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        preferredContactMethod: preferredContactMethod || null,
      },
    });
    res.status(201).json(customer);

  } catch (err) {
    res.status(500).json({ error: 'Could Not Save Customer' });
  }
});

export default router;