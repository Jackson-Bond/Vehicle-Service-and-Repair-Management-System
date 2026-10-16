import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// get work orders
router.get('/', async (req, res) => {
  const workOrders = await prisma.workOrder.findMany({
    where: { shopId: req.user.shopId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true } },
      vehicle: { select: { make: true, model: true, year: true } },
      technician: { select: { name: true } },
    },
  });
  res.json(workOrders);
});

// create a work order
router.post('/', async (req, res) => {

  const { customerId, vehicleId, assignedTechnician, mileageIn, customerComplaint } = req.body ?? {};

  const mileage = mileageIn === '' || mileageIn == null ? null : Number(mileageIn);
  if (mileage !== null && (!Number.isInteger(mileage) || mileage < 0)) {
    return res.status(400).json({ error: 'Invalid mileage' });
  }

  try {
    // customer has to be part of shop
    const customer = await prisma.customer.findFirst({
      where: { id: Number(customerId), shopId: req.user.shopId },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // technician has to be part of shop
    let techId = null;
    if (assignedTechnician) {
      const membership = await prisma.shopUser.findUnique({
        where: { shopId_userId: { shopId: req.user.shopId, userId: Number(assignedTechnician) } },
      });
      if (!membership) return res.status(400).json({ error: 'Invalid technician' });
      techId = membership.userId;
    }

    const workOrder = await prisma.workOrder.create({
      data: {
        shopId: req.user.shopId,
        createdBy: req.user.userId,
        customerId: customer.id,
        vehicleId: Number(vehicleId),
        assignedTechnician: techId,
        status: 'open',
        mileageIn: mileage,
        customerComplaint: customerComplaint?.trim() || null,
      },
    });
    res.status(201).json(workOrder);
  
    } catch (err) {
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'That vehicle is not registered to this customer' });
    }
    res.status(500).json({ error: 'Could Not Create Work Order' });
  }
});

export default router;