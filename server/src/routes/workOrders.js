import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

const CLOSED_STATUSES = ['completed', 'cancelled'];

async function findAccessibleWorkOrder(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid work order id' });
    return null;
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: { id, shopId: req.user.shopId },
  });

  if (!workOrder || (req.user.role === 'technician' && workOrder.assignedTechnician !== req.user.userId)) {
    res.status(404).json({ error: 'Work order not found' });
    return null;
  }
  return workOrder;
}

function canEdit(user, workOrder) {
  if (user.role === 'manager') return true;
  return user.role === 'technician' && workOrder.assignedTechnician === user.userId;
}

function loadDetail(id) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      vehicle: { select: { id: true, vin: true, make: true, model: true, year: true } },
      technician: { select: { id: true, name: true } },
      creator: { select: { user: { select: { name: true } } } },
      parts: {
        include: { part: { select: { partNumber: true, name: true } } },
        orderBy: { partId: 'asc' },
      },
      services: {
        include: { service: { select: { name: true } } },
        orderBy: { serviceId: 'asc' },
      },
    },
  });
}

// get work orders
router.get('/', async (req, res) => {
  try {
    const workOrders = await prisma.workOrder.findMany({
      where: {
        shopId: req.user.shopId,
        ...(req.user.role === 'technician' && { assignedTechnician: req.user.userId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        customerComplaint: true,
        customer: { select: { name: true } },
        vehicle: { select: { make: true, model: true, year: true } },
        technician: { select: { name: true } },
      },
    });
    res.json(workOrders);
  } catch (err) {
    res.status(500).json({ error: 'Could not load work orders' });
  }
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

router.get('/:id', async (req, res) => {
  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    const detail = await loadDetail(workOrder.id);
    res.json({ ...detail, canEdit: canEdit(req.user, workOrder) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load work order' });
  }
});

router.patch('/:id/diagnosis', async (req, res) => {
  const { diagnosis, recommendedRepairs } = req.body ?? {};

  if (diagnosis != null && typeof diagnosis !== 'string') {
    return res.status(400).json({ error: 'Diagnosis must be text' });
  }
  if (recommendedRepairs != null && typeof recommendedRepairs !== 'string') {
    return res.status(400).json({ error: 'Recommended repairs must be text' });
  }
  if (!diagnosis?.trim()) {
    return res.status(400).json({ error: 'Diagnosis is required' });
  }

  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    if (!canEdit(req.user, workOrder)) {
      return res.status(403).json({ error: 'Only the assigned technician or a manager can record a diagnosis' });
    }
    if (CLOSED_STATUSES.includes(workOrder.status)) {
      return res.status(400).json({ error: 'This work order is closed' });
    }

    await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        diagnosis: diagnosis.trim(),
        notes: recommendedRepairs?.trim() || null,
      },
    });

    const detail = await loadDetail(workOrder.id);
    res.json({ ...detail, canEdit: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save diagnosis' });
  }
});

router.post('/:id/parts', async (req, res) => {
  const partId = Number(req.body?.partId);
  const quantity = Number(req.body?.quantity);

  if (!Number.isInteger(partId)) {
    return res.status(400).json({ error: 'Select a part' });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'Quantity must be a whole number of at least 1' });
  }

  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    if (!canEdit(req.user, workOrder)) {
      return res.status(403).json({ error: 'Only the assigned technician or a manager can record parts' });
    }
    if (CLOSED_STATUSES.includes(workOrder.status)) {
      return res.status(400).json({ error: 'This work order is closed' });
    }

    await prisma.$transaction(async (tx) => {
      const part = await tx.part.findFirst({ where: { id: partId, shopId: req.user.shopId } });
      if (!part) {
        throw Object.assign(new Error('Part not found'), { status: 404 });
      }

      const taken = await tx.part.updateMany({
        where: { id: part.id, quantityInStock: { gte: quantity } },
        data: { quantityInStock: { decrement: quantity } },
      });
      if (taken.count === 0) {
        throw Object.assign(
          new Error(`Only ${part.quantityInStock} of ${part.name} in stock`),
          { status: 400 }
        );
      }

      await tx.workOrderPart.upsert({
        where: { workOrderId_partId: { workOrderId: workOrder.id, partId: part.id } },
        update: { quantity: { increment: quantity } },
        create: {
          workOrderId: workOrder.id,
          partId: part.id,
          shopId: req.user.shopId,
          quantity,
          unitPrice: part.price,
        },
      });
    });

    const detail = await loadDetail(workOrder.id);
    res.status(201).json({ ...detail, canEdit: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Could not record part' });
  }
});

router.delete('/:id/parts/:partId', async (req, res) => {
  const partId = Number(req.params.partId);
  if (!Number.isInteger(partId)) {
    return res.status(400).json({ error: 'Invalid part id' });
  }

  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    if (!canEdit(req.user, workOrder)) {
      return res.status(403).json({ error: 'Only the assigned technician or a manager can remove parts' });
    }
    if (CLOSED_STATUSES.includes(workOrder.status)) {
      return res.status(400).json({ error: 'This work order is closed' });
    }

    await prisma.$transaction(async (tx) => {
      const line = await tx.workOrderPart.findUnique({
        where: { workOrderId_partId: { workOrderId: workOrder.id, partId } },
      });
      if (!line) {
        throw Object.assign(new Error('That part is not on this work order'), { status: 404 });
      }

      await tx.workOrderPart.delete({
        where: { workOrderId_partId: { workOrderId: workOrder.id, partId } },
      });
      await tx.part.update({
        where: { id: partId },
        data: { quantityInStock: { increment: line.quantity } },
      });
    });

    const detail = await loadDetail(workOrder.id);
    res.json({ ...detail, canEdit: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Could not remove part' });
  }
});

export default router;