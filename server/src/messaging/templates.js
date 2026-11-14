export const TEMPLATES = {
  service_requested: (d) =>
    `Hi ${d.name}, ${d.shop} received your service request for your ${d.vehicle}. We'll update you as it progresses.`,
  checked_in: (d) =>
    `Hi ${d.name}, your ${d.vehicle} has been checked in at ${d.shop}.`,
  customer_approval: (d) =>
    `Hi ${d.name}, the diagnosis for your ${d.vehicle} is ready. Please contact ${d.shop} to review and approve the work.`,
  approved: (d) =>
    `Thanks ${d.name}, your approval is recorded. ${d.shop} will begin work on your ${d.vehicle}.`,
  completed: (d) =>
    `Good news ${d.name}, the repair on your ${d.vehicle} is complete and ready for pickup at ${d.shop}.`,
  declined: (d) =>
    `Hi ${d.name}, we've recorded that you declined the work on your ${d.vehicle}. Contact ${d.shop} if that changes.`,
  cancelled: (d) =>
    `Hi ${d.name}, the work order for your ${d.vehicle} at ${d.shop} has been cancelled.`,
};