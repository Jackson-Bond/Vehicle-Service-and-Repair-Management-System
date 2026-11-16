import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { allowedNext } from '../workOrderStatus.js';
import { calculateEstimate, estimateForWorkOrder } from '../estimate.js';
import { recordStatus } from '../statusChange.js';
import { audit } from '../lib/audit.js';
import { notifyStatusChange } from '../messaging/notify.js';
import requireRole from '../middleware/requireRole.js';
import invoiceRoutes from './invoice.js';

const router = Router();
const PROGRESS = ['not_started', 'in_progress', 'completed'];
const APPROVAL_METHODS = ['in_person', 'phone', 'sms', 'email'];
// stages where services and parts may still be added (FR-12 covers adding during repair)
const EDIT_STAGES = ['diagnosis', 'in_repair'];

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
      approvals: { orderBy: { id: 'asc' } },
      invoice: { select: { id: true, total: true, paymentStatus: true } },
    },
  });
}

async function shopTaxRate(shopId) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { taxRate: true } });
  return Number(shop?.taxRate ?? 0);
}

function lastApproved(approvals) {
  return [...approvals].reverse().find((a) => a.decision === 'approved') ?? null;
}

// statuses the buttons may offer. After an approval, a pending re-approval can also go back to repair
// when the customer declines only the extra work.
function nextStatuses(wo, approvals) {
  const next = allowedNext(wo.status);
  if (wo.status === 'customer_approval' && lastApproved(approvals)) return [...next, 'in_repair'];
  return next;
}

// helper to build response
async function buildDetail(user, id) {
  const detail = await loadDetail(id);
  const taxRate = await shopTaxRate(detail.shopId);
  const approval = lastApproved(detail.approvals);
  return {
    ...detail,
    canEdit: canEdit(user, detail),
    allowedNextStatuses: nextStatuses(detail, detail.approvals),
    // FR-09: everything currently on the order
    estimate: estimateForWorkOrder(detail, taxRate),
    // what the customer has approved so far (labor they approved + all parts)
    approvedEstimate: approval ? estimateForWorkOrder(detail, taxRate, { onlyApproved: true }) : null,
    approvedTotal: approval ? Number(approval.approvedTotal) : null,
  };
}

// FR-12: moves an in-repair order back to customer approval because the estimate went up.
async function requireReapproval(tx, wo, userId, reason) {
  const moved = await tx.workOrder.updateMany({
    where: { id: wo.id, status: 'in_repair' },
    data: { status: 'customer_approval' },
  });
  if (moved.count === 1) await recordStatus(tx, wo, 'customer_approval', userId, reason);
  return moved.count === 1;
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
      if (!membership || !membership.active) return res.status(400).json({ error: 'Invalid technician' });
      techId = membership.userId;
    }

    const workOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.workOrder.create({
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
      await recordStatus(tx, { id: created.id, shopId: created.shopId, status: null }, 'service_requested', req.user.userId, 'Service request created');
      await audit(req.user, 'create', 'work_order', created.id, { customerId: customer.id, vehicleId: Number(vehicleId) }, tx);
      return created;
    });
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

    await audit(req.user, 'update', 'work_order', workOrder.id, { field: 'diagnosis' });
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
    if (!EDIT_STAGES.includes(workOrder.status)) {
      return res.status(400).json({ error: 'Parts can only be changed during diagnosis or repair' });
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

      // FR-12: parts added during repair that push the total above what was approved need a new approval
      if (workOrder.status === 'in_repair') {
        const fresh = await tx.workOrder.findUnique({ where: { id: workOrder.id }, include: { services: true, parts: true } });
        const approval = await tx.approval.findFirst({ where: { workOrderId: workOrder.id, decision: 'approved' }, orderBy: { id: 'desc' } });
        const taxRate = Number((await tx.shop.findUnique({ where: { id: req.user.shopId } })).taxRate);
        const now = estimateForWorkOrder(fresh, taxRate, { onlyApproved: true }).total;
        if (!approval || now > Number(approval.approvedTotal)) {
          await requireReapproval(tx, workOrder, req.user.userId, `Parts raised the estimate to ${now.toFixed(2)}; new approval needed`);
        }
      }
      await audit(req.user, 'add_part', 'work_order', workOrder.id, { partId: part.id, quantity }, tx);
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
      return res.status(400).json({ error: 'Parts can only be removed during the diagnosis stage' });
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
    if (!EDIT_STAGES.includes(workOrder.status)) {
      return res.status(400).json({ error: 'Services can only be added during diagnosis or repair' });
    }

    const service = await prisma.service.findFirst({
      where: { id: serviceId, shopId: req.user.shopId },
    });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    await prisma.$transaction(async (tx) => {
      await tx.workOrderService.create({
        data: {
          workOrderId: workOrder.id,
          serviceId: service.id,
          shopId: req.user.shopId,
          price: service.defaultPrice,
        },
      });
      // FR-12: a new service during repair is unapproved work, so approval is needed again
      if (workOrder.status === 'in_repair') {
        await requireReapproval(tx, workOrder, req.user.userId, `Added service "${service.name}"; new approval needed`);
      }
      await audit(req.user, 'add_service', 'work_order', workOrder.id, { serviceId: service.id }, tx);
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

    const lines = await prisma.workOrderService.findMany({ where: { workOrderId: wo.id } });
    const parts = await prisma.workOrderPart.findMany({ where: { workOrderId: wo.id } });
    const approvals = await prisma.approval.findMany({ where: { workOrderId: wo.id }, orderBy: { id: 'asc' } });
    const taxRate = await shopTaxRate(req.user.shopId);
    const prior = lastApproved(approvals);

    if (!nextStatuses(wo, approvals).includes(next)) {
      return res.status(400).json({ error: 'That status change is not allowed' });
    }

    // "declined" on a re-approval (customer refuses only the extra work) goes back to repair
    const decliningExtra = wo.status === 'customer_approval' && next === 'in_repair';
    // recording the customer's decision and closing the job are front-desk (manager) actions
    if ((['approved', 'declined', 'closed'].includes(next) || decliningExtra) && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Only a manager can record approval decisions or close a work order' });
    }

    // check-in: capture mileage and condition notes (FR-05)
    let checkIn = {};
    if (next === 'checked_in') {
      const raw = req.body?.mileageIn;
      if (raw !== undefined && raw !== null && raw !== '') {
        const mileage = Number(raw);
        if (!Number.isInteger(mileage) || mileage < 0) return res.status(400).json({ error: 'Invalid mileage' });
        const last = await prisma.workOrder.aggregate({
          where: { vehicleId: wo.vehicleId, id: { not: wo.id }, shopId: wo.shopId },
          _max: { mileageIn: true },
        });
        if (last._max.mileageIn != null && mileage < last._max.mileageIn) {
          return res.status(400).json({ error: `Mileage is lower than the last recorded value (${last._max.mileageIn})` });
        }
        checkIn.mileageIn = mileage;
      }
      if (typeof req.body?.conditionNotes === 'string' && req.body.conditionNotes.trim()) {
        checkIn.conditionNotes = req.body.conditionNotes.trim();
      }
    }

    // asking customer to approve: a diagnosis and at least one service must exist
    if (next === 'customer_approval' && wo.status !== 'in_repair') {
      if (!wo.diagnosis?.trim()) {
        return res.status(400).json({ error: 'Save a diagnosis before requesting approval' });
      }
      if (lines.length === 0) {
        return res.status(400).json({ error: 'Add at least one service before requesting approval' });
      }
    }

    // FR-10: approval or decline needs the method it was given by
    const isDecision = ['approved', 'declined'].includes(next) || decliningExtra;
    const method = req.body?.approvalMethod;
    if (isDecision && !APPROVAL_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Choose how the customer answered (in person, phone, SMS or email)' });
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

    // FR-11: repair cannot start without a recorded approval that covers the current estimate
    if (next === 'in_repair' && !decliningExtra) {
      const covered = prior
        && estimateForWorkOrder({ services: lines, parts }, taxRate, { onlyApproved: true }).total <= Number(prior.approvedTotal);
      if (!covered) {
        return res.status(400).json({ error: 'Repair cannot start until the customer approval is recorded' });
      }
    }

    // every approved service must be finished
    if (next === 'completed' && lines.some((l) => l.approved && l.progress !== 'completed')) {
      return res.status(400).json({ error: 'All approved services must be completed first' });
    }

    // a job is closed once its invoice exists and is paid (FR-19)
    if (next === 'closed') {
      const invoice = await prisma.invoice.findUnique({ where: { workOrderId: wo.id } });
      if (!invoice) return res.status(400).json({ error: 'Generate the invoice before closing' });
      if (invoice.paymentStatus !== 'paid') return res.status(400).json({ error: 'Record payment before closing' });
    }

    await prisma.$transaction(async (tx) => {
      // current status is in the where clause, so two simultaneous clicks can't both win
      const result = await tx.workOrder.updateMany({
        where: { id: wo.id, shopId: req.user.shopId, status: wo.status },
        data: {
          status: next,
          ...checkIn,
          ...(next === 'completed' && { completedAt: new Date() }),
        },
      });
      if (result.count === 0) {
        throw Object.assign(new Error('Status changed by someone else, please reload'), { status: 409 });
      }

      let note = null;

      if (next === 'approved') {
        const keep = new Set(lines.filter((l) => l.approved).map((l) => l.serviceId));
        const chosen = new Set([...keep, ...approvedIds]);
        // services approved earlier keep their progress; the rest follow the new choice
        await tx.workOrderService.updateMany({
          where: { workOrderId: wo.id, serviceId: { notIn: [...keep] } },
          data: { approved: false, progress: 'not_started' },
        });
        await tx.workOrderService.updateMany({
          where: { workOrderId: wo.id, serviceId: { in: [...chosen] } },
          data: { approved: true },
        });
        const approvedTotal = calculateEstimate({
          services: lines.filter((l) => chosen.has(l.serviceId)),
          parts,
          taxRate,
        }).total;
        await tx.approval.create({
          data: {
            workOrderId: wo.id, shopId: wo.shopId, decision: 'approved', method,
            approvedTotal, recordedBy: req.user.userId, note: req.body?.note?.trim() || null,
          },
        });
        note = `Customer approved by ${method}`;
        await audit(req.user, 'approve', 'work_order', wo.id, { method, approvedTotal }, tx);
      } else if (next === 'declined' || decliningExtra) {
        const keepTotal = prior ? Number(prior.approvedTotal) : 0;
        await tx.approval.create({
          data: {
            workOrderId: wo.id, shopId: wo.shopId, decision: 'declined', method,
            approvedTotal: keepTotal, recordedBy: req.user.userId, note: req.body?.note?.trim() || null,
          },
        });
        if (decliningExtra) {
          // drop the extra, unapproved work and carry on with what was approved
          await tx.workOrderService.deleteMany({ where: { workOrderId: wo.id, approved: false } });
          note = `Customer declined the extra work by ${method}`;
        } else {
          note = `Customer declined by ${method}`;
        }
        await audit(req.user, 'decline', 'work_order', wo.id, { method }, tx);
      } else {
        await audit(req.user, 'status_change', 'work_order', wo.id, { from: wo.status, to: next }, tx);
      }

      await recordStatus(tx, wo, next, req.user.userId, note);
    });

    notifyStatusChange(wo.id);

    res.json(await buildDetail(req.user, wo.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Could not update status' });
  }
});

// FR-06: assign or reassign the technician; every change is logged
router.patch('/:id/technician', requireRole('manager'), async (req, res) => {
  const techId = Number(req.body?.technicianId);
  if (!Number.isInteger(techId)) return res.status(400).json({ error: 'Select a technician' });

  try {
    const wo = await findAccessibleWorkOrder(req, res);
    if (!wo) return;
    if (['completed', 'closed', 'declined', 'cancelled'].includes(wo.status)) {
      return res.status(400).json({ error: 'This work order is finished and cannot be reassigned' });
    }

    const member = await prisma.shopUser.findUnique({
      where: { shopId_userId: { shopId: req.user.shopId, userId: techId } },
      include: { user: { select: { name: true } } },
    });
    if (!member || member.role !== 'technician' || !member.active) {
      return res.status(400).json({ error: 'Choose an active technician' });
    }
    if (wo.assignedTechnician === techId) return res.status(400).json({ error: 'That technician is already assigned' });

    const previous = wo.assignedTechnician
      ? await prisma.user.findUnique({ where: { id: wo.assignedTechnician }, select: { name: true } })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id: wo.id }, data: { assignedTechnician: techId } });
      await recordStatus(
        tx, wo, wo.status, req.user.userId,
        previous ? `Technician reassigned: ${previous.name} to ${member.user.name}` : `Technician assigned: ${member.user.name}`
      );
      await audit(req.user, 'assign_technician', 'work_order', wo.id, { from: wo.assignedTechnician, to: techId }, tx);
    });

    res.json(await buildDetail(req.user, wo.id));
  } catch (err) {
    res.status(500).json({ error: 'Could not assign technician' });
  }
});

// FR-13: permanent status history
router.get('/:id/history', async (req, res) => {
  try {
    const wo = await findAccessibleWorkOrder(req, res);
    if (!wo) return;
    const rows = await prisma.statusHistory.findMany({ where: { workOrderId: wo.id }, orderBy: { id: 'asc' } });
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.changedBy))] } },
      select: { id: true, name: true },
    });
    const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
    res.json(rows.map((r) => ({ ...r, changedByName: names[r.changedBy] ?? 'Unknown' })));
  } catch (err) {
    res.status(500).json({ error: 'Could not load status history' });
  }
});

// FR-22: what the customer was told
router.get('/:id/notifications', async (req, res) => {
  try {
    const wo = await findAccessibleWorkOrder(req, res);
    if (!wo) return;
    res.json(await prisma.notificationLog.findMany({ where: { workOrderId: wo.id }, orderBy: { id: 'desc' } }));
  } catch (err) {
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

// FR-18 / FR-19: invoice routes live in their own file
router.use('/:id/invoice', invoiceRoutes);

export default router;
