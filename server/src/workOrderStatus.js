const TRANSITIONS = {
  service_requested: ['checked_in', 'cancelled'],
  checked_in:        ['diagnosis', 'cancelled'],
  diagnosis:         ['customer_approval', 'cancelled'],
  customer_approval: ['approved', 'declined', 'diagnosis', 'cancelled'],
  approved:          ['in_repair', 'cancelled'],
  in_repair:         ['completed', 'cancelled'],
  completed:         ['closed'],
  closed: [],
  declined: [],
  cancelled: [],
};

export function allowedNext(status) {
  return TRANSITIONS[status] ?? [];
}