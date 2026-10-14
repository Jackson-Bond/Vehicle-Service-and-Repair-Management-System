import { Router } from 'express';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';

const router = Router();

router.get('/', async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: { shopId: req.user.shopId }, // from the verified token, don't ever use the request
    orderBy: { name: 'asc' },
  });
  res.json(customers);
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: Number(req.params.id), shopId: req.user.shopId },
  });
  if (!customer) return res.status(404).json({ error: 'Not found' });
  res.json(customer);
});

router.post('/', requireRole('advisor', 'manager'), async (req, res) => {
  const { name, phone, email, preferredContactMethod } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const customer = await prisma.customer.create({
    data: { shopId: req.user.shopId, name, phone, email, preferredContactMethod },
  });
  res.status(201).json(customer);
});

export default router;