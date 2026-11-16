// Money maths in whole cents so totals never drift (FR-09, FR-18).

export function toCents(value) {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

// taxRate is a fraction, e.g. 0.0825 for 8.25%
export function calculateEstimate({ services = [], parts = [], taxRate = 0 }) {
  const laborCents = services.reduce((sum, line) => sum + toCents(line.price), 0);
  const partsCents = parts.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0);
  const subtotalCents = laborCents + partsCents;
  const rateBps = Math.round(Number(taxRate) * 10000);
  // round half up on whole cents
  const taxCents = Math.floor((subtotalCents * rateBps + 5000) / 10000);

  return {
    labor: fromCents(laborCents),
    parts: fromCents(partsCents),
    subtotal: fromCents(subtotalCents),
    taxRate: Number(taxRate),
    tax: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}

// Estimate for a work order row that was loaded with `services` and `parts`.
// onlyApproved limits labor to services the customer approved.
export function estimateForWorkOrder(workOrder, taxRate, { onlyApproved = false } = {}) {
  const services = onlyApproved ? workOrder.services.filter((s) => s.approved) : workOrder.services;
  return calculateEstimate({ services, parts: workOrder.parts, taxRate });
}
