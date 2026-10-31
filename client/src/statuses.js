// Display labels and colors for work order statuses.
// Matches the statuses in Jackson's backend. The labels are his.
const STATUSES = {
    service_requested: { label: 'Service requested', tone: 'new' },
    checked_in: { label: 'Vehicle checked in', tone: 'intake' },
    diagnosis: { label: 'Diagnosis', tone: 'diagnose' },
    customer_approval: { label: 'Customer approval', tone: 'waiting' },
    completed: { label: 'Repair completed', tone: 'done' },
    cancelled: { label: 'Cancelled', tone: 'stopped' },

    // Old values still in the seed data. Delete these two once Jackson's change is merged.
    open: { label: 'Open', tone: 'new' },
    in_progress: { label: 'In progress', tone: 'repair' },
};

function normalize(status) {
    return String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function statusInfo(status) {
    const known = STATUSES[normalize(status)];
    if (known) return known;
    const text = normalize(status).replace(/_/g, ' ');
    return { label: text ? text[0].toUpperCase() + text.slice(1) : 'Unknown', tone: 'new' };
}