import { Router } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';
import { calculateEstimate } from '../estimate.js';
import { audit } from '../lib/audit.js';
import { notifyInvoice } from '../messaging/notify.js';

// mounted at /api/work-orders/:id/invoice (FR-18, FR-19). Front-desk (manager) only.
const router = Router({ mergeParams: true });
router.use(requireRole('manager'));

const PAYMENT_METHODS = ['cash', 'card', 'check', 'other'];

async function loadWorkOrder(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid work order id' });
    return null;
  }
  const wo = await prisma.workOrder.findFirst({
    where: { id, shopId: req.user.shopId },
    include: {
      customer: true,
      vehicle: true,
      shop: true,
      services: { include: { service: { select: { name: true } } }, orderBy: { serviceId: 'asc' } },
      parts: { include: { part: { select: { partNumber: true, name: true } } }, orderBy: { partId: 'asc' } },
      invoice: true,
    },
  });
  if (!wo) res.status(404).json({ error: 'Work order not found' });
  return wo;
}

function present(invoice) {
  return invoice && {
    ...invoice,
    subtotal: Number(invoice.subtotal),
    taxRate: Number(invoice.taxRate),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
  };
}

// FR-18: built only from labor that was approved and finished, plus parts actually used
router.post('/', async (req, res) => {
  try {
    const wo = await loadWorkOrder(req, res);
    if (!wo) return;
    if (!['completed', 'closed'].includes(wo.status)) {
      return res.status(400).json({ error: 'An invoice can only be created once the work order is completed' });
    }
    if (wo.invoice) return res.status(409).json({ error: 'This work order already has an invoice' });

    const done = wo.services.filter((s) => s.approved && s.progress === 'completed');
    const taxRate = Number(wo.shop.taxRate);
    const totals = calculateEstimate({ services: done, parts: wo.parts, taxRate });

    const lines = [
      ...done.map((s) => ({ type: 'labor', description: s.service.name, quantity: 1, unitPrice: Number(s.price), amount: Number(s.price) })),
      ...wo.parts.map((p) => ({
        type: 'part',
        description: `${p.part.name} (${p.part.partNumber})`,
        quantity: p.quantity,
        unitPrice: Number(p.unitPrice),
        amount: Number((Number(p.unitPrice) * p.quantity).toFixed(2)),
      })),
    ];

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          workOrderId: wo.id,
          shopId: wo.shopId,
          lines,
          subtotal: totals.subtotal,
          taxRate,
          tax: totals.tax,
          total: totals.total,
          createdBy: req.user.userId,
        },
      });
      await audit(req.user, 'create', 'invoice', created.id, { workOrderId: wo.id, total: totals.total }, tx);
      return created;
    });
    notifyInvoice(wo.id);
    res.status(201).json(present(invoice));
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This work order already has an invoice' });
    res.status(500).json({ error: 'Could not create invoice' });
  }
});

router.get('/', async (req, res) => {
  try {
    const wo = await loadWorkOrder(req, res);
    if (!wo) return;
    if (!wo.invoice) return res.status(404).json({ error: 'No invoice yet' });
    res.json(present(wo.invoice));
  } catch (err) {
    res.status(500).json({ error: 'Could not load invoice' });
  }
});

// payment status (FR-19)
router.patch('/payment', async (req, res) => {
  const { status, method } = req.body ?? {};
  if (!['paid', 'unpaid'].includes(status)) return res.status(400).json({ error: 'Status must be paid or unpaid' });
  if (status === 'paid' && !PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Choose a payment method (cash, card, check or other)' });
  }

  try {
    const wo = await loadWorkOrder(req, res);
    if (!wo) return;
    if (!wo.invoice) return res.status(404).json({ error: 'No invoice yet' });
    if (wo.status === 'closed') return res.status(400).json({ error: 'A closed work order cannot be changed' });

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id: wo.invoice.id },
        data: status === 'paid'
          ? { paymentStatus: 'paid', paymentMethod: method, paidAt: new Date() }
          : { paymentStatus: 'unpaid', paymentMethod: null, paidAt: null },
      });
      await audit(req.user, 'payment', 'invoice', row.id, { status, method: method ?? null }, tx);
      return row;
    });
    res.json(present(updated));
  } catch (err) {
    res.status(500).json({ error: 'Could not record payment' });
  }
});

function buildPdf(wo) {
  const invoice = wo.invoice;
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const money = (n) => `$${Number(n).toFixed(2)}`;
  doc.fontSize(20).text(wo.shop.name);
  doc.fontSize(10).fillColor('#555').text([wo.shop.address, wo.shop.phone, wo.shop.email].filter(Boolean).join('  |  '));
  doc.moveDown().fillColor('#000').fontSize(16).text(`Invoice #${invoice.id}`);
  doc.fontSize(10)
    .text(`Work order #${wo.id}  |  ${new Date(invoice.createdAt).toLocaleDateString('en-US')}`)
    .text(`Customer: ${wo.customer.name}`)
    .text(`Vehicle: ${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}  VIN ${wo.vehicle.vin}`)
    .moveDown();

  doc.fontSize(10).text('Description', 50, doc.y, { continued: false });
  doc.moveDown(0.3);
  for (const line of invoice.lines) {
    const y = doc.y;
    doc.text(`${line.description}${line.quantity > 1 ? ` x${line.quantity}` : ''}`, 50, y, { width: 340 });
    doc.text(money(line.amount), 400, y, { width: 90, align: 'right' });
  }
  doc.moveDown();
  const row = (label, value) => {
    const y = doc.y;
    doc.text(label, 300, y, { width: 100 });
    doc.text(value, 400, y, { width: 90, align: 'right' });
  };
  row('Subtotal', money(invoice.subtotal));
  row(`Tax (${(Number(invoice.taxRate) * 100).toFixed(2)}%)`, money(invoice.tax));
  doc.font('Helvetica-Bold');
  row('Total', money(invoice.total));
  doc.font('Helvetica').moveDown();
  doc.text(invoice.paymentStatus === 'paid'
    ? `PAID ${invoice.paymentMethod ? `by ${invoice.paymentMethod}` : ''} ${invoice.paidAt ? `on ${new Date(invoice.paidAt).toLocaleDateString('en-US')}` : ''}`
    : 'Payment due at the shop');
  doc.end();
  return done;
}

// view / print
router.get('/pdf', async (req, res) => {
  try {
    const wo = await loadWorkOrder(req, res);
    if (!wo) return;
    if (!wo.invoice) return res.status(404).json({ error: 'No invoice yet' });
    const pdf = await buildPdf(wo);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${wo.invoice.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: 'Could not build invoice PDF' });
  }
});

// email the PDF to the customer (sent through SMTP when MESSAGING_DRIVER=live, otherwise it is only logged)
router.post('/email', async (req, res) => {
  try {
    const wo = await loadWorkOrder(req, res);
    if (!wo) return;
    if (!wo.invoice) return res.status(404).json({ error: 'No invoice yet' });
    if (!wo.customer.email) return res.status(400).json({ error: 'This customer has no email address on file' });

    const buffer = await buildPdf(wo);
    const log = await notifyInvoice(wo.id, { buffer, filename: `invoice-${wo.invoice.id}.pdf` });
    await audit(req.user, 'email_invoice', 'invoice', wo.invoice.id, { result: log?.result ?? 'failed' });
    res.json({ result: log?.result ?? 'failed', channel: log?.channel ?? 'email' });
  } catch (err) {
    res.status(500).json({ error: 'Could not email invoice' });
  }
});

export default router;
