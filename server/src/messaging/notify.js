import prisma from '../lib/prisma.js';
import { formatEmailHtml, TEMPLATES } from './templates.js';
import { sendEmail } from './transports.js';

const load = (workOrderId) => prisma.workOrder.findUnique({
  where: { id: workOrderId },
  include: {
    customer: true,
    vehicle: true,
    shop: { select: { name: true } },
  },
});

const vehicleName = (vehicle) => `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

// FR-22: every attempt is written to notification_log so the work order page can show it.
// A failure here is logged and swallowed, so it can never block the action that triggered it.
function record(wo, event, result, recipient, detail) {
  return prisma.notificationLog.create({
    data: {
      shopId: wo.shopId,
      workOrderId: wo.id,
      customerId: wo.customerId,
      event,
      channel: recipient ? 'email' : 'none',
      recipient,
      result,
      detail,
    },
  });
}

async function deliver(wo, event, { subject, text, attachments }) {
  const { customer } = wo;
  const label = `work order #${wo.id} (${event})`;

  if (!customer.email) {
    console.log(`Skipped ${label}: no email on file`);
    return record(wo, event, 'skipped', null, 'Customer has no email on file');
  }

  try {
    const result = await sendEmail({
      to: customer.email,
      subject,
      text,
      html: formatEmailHtml({ shop: wo.shop.name, vehicle: vehicleName(wo.vehicle), text, workOrderId: wo.id }),
      attachments,
    });
    console.log(`${result === 'sent' ? 'Sent' : 'Logged'} email for ${label}`);
    return record(wo, event, result, customer.email, text);
  } catch (err) {
    console.error('Notification failed:', err.message);
    return record(wo, event, 'failed', customer.email, err.message);
  }
}

export async function notifyStatusChange(workOrderId) {
  try {
    const wo = await load(workOrderId);
    if (!wo) return null;

    const template = TEMPLATES[wo.status];
    if (!template) return null; // this status doesn't send a message

    const text = template({
      name: wo.customer.name.split(' ')[0],
      shop: wo.shop.name,
      vehicle: vehicleName(wo.vehicle),
    });
    return await deliver(wo, wo.status, { subject: `Update from ${wo.shop.name}`, text });
  } catch (err) {
    console.error('Notification failed:', err.message);
    return null;
  }
}

// FR-19: tell the customer the invoice is ready, with the PDF attached when we have it.
export async function notifyInvoice(workOrderId, attachment) {
  try {
    const wo = await load(workOrderId);
    if (!wo) return null;

    const text = `Hi ${wo.customer.name.split(' ')[0]}, the invoice for work order #${wo.id} on your ${vehicleName(wo.vehicle)} is ready.`;
    return await deliver(wo, 'invoice_ready', {
      subject: `Invoice for work order #${wo.id} from ${wo.shop.name}`,
      text,
      attachments: attachment ? [{ filename: attachment.filename, content: attachment.buffer }] : undefined,
    });
  } catch (err) {
    console.error('Notification failed:', err.message);
    return null;
  }
}
