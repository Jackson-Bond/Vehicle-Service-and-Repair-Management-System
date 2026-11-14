import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { allowedNext } from '../workOrderStatus.js';
import { notifyStatusChange } from '../messaging/notify.js';

const router = Router();
const PROGRESS = ['not_started', 'in_progress', 'completed'];

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

// helper to build response
async function buildDetail(user, id) {
  const detail = await loadDetail(id);
  return {
    ...detail,
    canEdit: canEdit(user, detail),
    allowedNextStatuses: allowedNext(detail.status),
  };
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
        status: 'service_requested',
        mileageIn: mileage,
        customerComplaint: customerComplaint?.trim() || null,
      },
    });

    // push to notificaitons
    notifyStatusChange(workOrder.id);
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

    res.json(await buildDetail(req.user, workOrder.id));
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
    if (workOrder.status !== 'diagnosis') {
      return res.status(400).json({ error: 'Diagnosis and parts can only be changed during the diagnosis stage' });
    }

    await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        diagnosis: diagnosis.trim(),
        notes: recommendedRepairs?.trim() || null,
      },
    });

    res.json(await buildDetail(req.user, workOrder.id));
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
    if (workOrder.status !== 'diagnosis') {
      return res.status(400).json({ error: 'Diagnosis and parts can only be changed during the diagnosis stage' });
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

    res.json(await buildDetail(req.user, workOrder.id));
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
    if (workOrder.status !== 'diagnosis') {
      return res.status(400).json({ error: 'Diagnosis and parts can only be changed during the diagnosis stage' });
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

    res.json(await buildDetail(req.user, workOrder.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Could not remove part' });
  }
});

router.post('/:id/services', async (req, res) => {
  const serviceId = Number(req.body?.serviceId);
  if (!Number.isInteger(serviceId)) return res.status(400).json({ error: 'Select a service' });

  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    if (!canEdit(req.user, workOrder)) {
      return res.status(403).json({ error: 'Only the assigned technician or a manager can add services' });
    }
    if (workOrder.status !== 'diagnosis') {
      return res.status(400).json({ error: 'Services can only be added during the diagnosis stage' });
    }

    const service = await prisma.service.findFirst({
      where: { id: serviceId, shopId: req.user.shopId },
    });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    await prisma.workOrderService.create({
      data: {
        workOrderId: workOrder.id,
        serviceId: service.id,
        shopId: req.user.shopId,
        price: service.defaultPrice,
      },
    });

    res.status(201).json(await buildDetail(req.user, workOrder.id));
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That service is already on this work order' });
    res.status(500).json({ error: 'Could not add service' });
  }
});

router.delete('/:id/services/:serviceId', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId)) return res.status(400).json({ error: 'Invalid service id' });

  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    if (!canEdit(req.user, workOrder)) {
      return res.status(403).json({ error: 'Only the assigned technician or a manager can remove services' });
    }
    if (workOrder.status !== 'diagnosis') {
      return res.status(400).json({ error: 'Services can only be changed during the diagnosis stage' });
    }

    const result = await prisma.workOrderService.deleteMany({
      where: { workOrderId: workOrder.id, serviceId },
    });
    if (result.count === 0) return res.status(404).json({ error: 'That service is not on this work order' });

    res.json(await buildDetail(req.user, workOrder.id));
  } catch (err) {
    res.status(500).json({ error: 'Could not remove service' });
  }
});

router.patch('/:id/services/:serviceId/progress', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  const progress = req.body?.progress;
  if (!Number.isInteger(serviceId)) return res.status(400).json({ error: 'Invalid service id' });
  if (!PROGRESS.includes(progress)) return res.status(400).json({ error: 'Invalid progress' });

  try {
    const workOrder = await findAccessibleWorkOrder(req, res);
    if (!workOrder) return;

    if (!canEdit(req.user, workOrder)) {
      return res.status(403).json({ error: 'Only the assigned technician or a manager can update progress' });
    }
    if (workOrder.status !== 'in_repair') {
      return res.status(400).json({ error: 'Progress can only be changed while the work order is in repair' });
    }

    const result = await prisma.workOrderService.updateMany({
      where: { workOrderId: workOrder.id, serviceId, approved: true },
      data: { progress },
    });
    if (result.count === 0) return res.status(404).json({ error: 'That approved service is not on this work order' });

    res.json(await buildDetail(req.user, workOrder.id));
  } catch (err) {
    res.status(500).json({ error: 'Could not update progress' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const next = req.body?.status;

  try {
    const wo = await findAccessibleWorkOrder(req, res);
    if (!wo) return;

    if (!allowedNext(wo.status).includes(next)) {
      return res.status(400).json({ error: 'That status change is not allowed' });
    }

    const lines = await prisma.workOrderService.findMany({ where: { workOrderId: wo.id } });

    // asking customer to approve: a diagnosis and at least one service must exist
    if (next === 'customer_approval') {
      if (!wo.diagnosis?.trim()) {
        return res.status(400).json({ error: 'Save a diagnosis before requesting approval' });
      }
      if (lines.length === 0) {
        return res.status(400).json({ error: 'Add at least one service before requesting approval' });
      }
    }

    // request must say which services the customer picked
    let approvedIds = [];
    if (next === 'approved') {
      if (!Array.isArray(req.body?.approvedServiceIds)) {
        return res.status(400).json({ error: 'approvedServiceIds is required' });
      }
      approvedIds = req.body.approvedServiceIds.map(Number);
      const onOrder = new Set(lines.map((l) => l.serviceId));
      if (approvedIds.length === 0 || !approvedIds.every((id) => onOrder.has(id))) {
        return res.status(400).json({ error: 'Select at least one service (or choose Declined)' });
      }
    }

    // every approved service must be finished
    if (next === 'completed' && lines.some((l) => l.approved && l.progress !== 'completed')) {
      return res.status(400).json({ error: 'All approved services must be completed first' });
    }

    await prisma.$transaction(async (tx) => {
      // current status is in the where clause, so two simultaneous clicks can't both win
      const result = await tx.workOrder.updateMany({
        where: { id: wo.id, shopId: req.user.shopId, status: wo.status },
        data: {
          status: next,
          ...(next === 'completed' && { completedAt: new Date() }),
        },
      });
      if (result.count === 0) {
        throw Object.assign(new Error('Status changed by someone else, please reload'), { status: 409 });
      }

      if (next === 'approved') {
        await tx.workOrderService.updateMany({
          where: { workOrderId: wo.id },
          data: { approved: false, progress: 'not_started' },
        });
        await tx.workOrderService.updateMany({
          where: { workOrderId: wo.id, serviceId: { in: approvedIds } },
          data: { approved: true },
        });
      }
    });

    // send notification
    notifyStatusChange(wo.id); 

    res.json(await buildDetail(req.user, wo.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Could not update status' });
  }
});

export default router;