import prisma from '../lib/prisma.js';
import { TEMPLATES } from './templates.js';
import { sendEmail } from './transports.js';

export async function notifyStatusChange(workOrderId) {
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        customer: true,
        vehicle: true,
        shop: { select: { name: true } },
      },
    });
    if (!wo) return;

    const template = TEMPLATES[wo.status];
    if (!template) return; // this status doesn't send a message

    const { customer } = wo;
    const label = `work order #${wo.id} (${wo.status})`;

    if (!customer.email) {
      return console.log(`Skipped ${label}: no email on file`);
    }

    const text = template({
      name: customer.name.split(' ')[0],
      shop: wo.shop.name,
      vehicle: `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}`,
    });

    await sendEmail({ to: customer.email, subject: `Update from ${wo.shop.name}`, text });
    console.log(`Sent email for ${label}`);
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}