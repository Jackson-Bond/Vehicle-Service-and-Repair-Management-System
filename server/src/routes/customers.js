import { Router } from 'express';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';
import { historyFilter, loadHistory } from '../serviceHistory.js';

const router = Router();

function customerId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : null;
}

function findCustomer(req) {
  const id = customerId(req);
  if (id === null) return null;
  return prisma.customer.findFirst({ where: { id, shopId: req.user.shopId } });
}

function validateCustomer({ name }) {
  if (!name?.trim()) return 'Name is required';
  return null;
}

function customerData({ name, phone, email }) {
  return {
    name: name.trim(),
    phone: phone?.trim() || null,
    email: email?.trim() || null,
  };
}

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
      include: {
        _count: { select: { vehicles: true } },
        // most recent work order, for the "last visit" column
        workOrders: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    res.json(customers.map(({ _count, workOrders, ...customer }) => ({
      ...customer,
      vehicleCount: _count.vehicles,
      lastVisit: workOrders[0]?.createdAt ?? null,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Could not load customers' });
  }
});

// customer details with their vehicles
router.get('/:id', async (req, res) => {
  try {
    const customer = await findCustomer(req);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const links = await prisma.customerVehicle.findMany({
      where: { customerId: customer.id },
      include: { vehicle: true },
      orderBy: { vehicleId: 'asc' },
    });
    res.json({ ...customer, vehicles: links.map((l) => l.vehicle) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load customer' });
  }
});

router.get('/:id/vehicles', async (req, res) => {
  try {
    const customer = await findCustomer(req);
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

router.get('/:id/history', async (req, res) => {
  const { filter, error } = historyFilter(req.query);
  if (error) return res.status(400).json({ error });

  try {
    const customer = await findCustomer(req);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    res.json(await loadHistory(req.user, { customerId: customer.id, ...filter }));
  } catch (err) {
    res.status(500).json({ error: 'Could not load service history' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const invalid = validateCustomer(body);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const customer = await prisma.customer.create({
      // shop comes from the token, never the body
      data: { shopId: req.user.shopId, ...customerData(body) },
    });
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Could not save customer' });
  }
});

// FR-03: edit a customer's details
router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const invalid = validateCustomer(body);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const customer = await findCustomer(req);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: customerData(body),
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not save customer' });
  }
});

export default router;