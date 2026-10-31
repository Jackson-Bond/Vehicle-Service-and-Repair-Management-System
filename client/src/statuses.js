export const STATUS_INFO = {
  service_requested: { label: 'Service requested', tone: 'new' },
  checked_in:        { label: 'Checked in',        tone: 'intake' },
  diagnosis:         { label: 'Diagnosis',         tone: 'diagnose' },
  customer_approval: { label: 'Awaiting approval', tone: 'waiting' },
  approved:          { label: 'Approved',          tone: 'intake' },
  in_repair:         { label: 'In repair',         tone: 'repair' },
  completed:         { label: 'Completed',         tone: 'done' },
  closed:            { label: 'Closed',            tone: 'done' },
  declined:          { label: 'Declined',          tone: 'stopped' },
  cancelled:         { label: 'Cancelled',         tone: 'stopped' },
};

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_INFO).map(([key, info]) => [key, info.label])
);

export const PROGRESS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};