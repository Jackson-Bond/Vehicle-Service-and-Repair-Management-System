// Full-workflow check against a running API: npm run test:e2e (from server/)
// Needs the seeded database (npm run seed) and the server on API_URL (default http://localhost:4000/api).
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
let passed = 0;
async function call(token, method, path, body) {
    const res = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data };
}
async function step(name, fn) {
    try { await fn(); passed++; console.log('PASS', name); }
    catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
}
async function login(employeeCode, pin) {
    const r = await fetch(API + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: 1, employeeCode, pin }),
    });
    return (await r.json()).token;
}

const mgr = await login(1001, '123456');
const tech = await login(1002, '234567');
const tom = await login(1003, '345678');
let id;

await step('login works for manager and technician', () => assert.ok(mgr && tech));

const customers = (await call(mgr, 'GET', '/customers')).data;
const maria = customers.find((c) => c.name === 'Maria Lopez');
const vehicles = (await call(mgr, 'GET', `/customers/${maria.id}/vehicles`)).data;
const users = (await call(mgr, 'GET', '/users?role=technician')).data;
const sam = users.find((u) => u.name === 'Sam Technician');
const tomUser = users.find((u) => u.name === 'Tom Technician');
const services = (await call(mgr, 'GET', '/services')).data;
const parts = (await call(mgr, 'GET', '/parts')).data;
const oil = services.find((s) => /oil/i.test(s.name));
const brake = services.find((s) => /brake/i.test(s.name));
const pads = parts.find((p) => /brake/i.test(p.name));

await step('FR-04 create service request, status service_requested', async () => {
    const r = await call(mgr, 'POST', '/work-orders', { customerId: maria.id, vehicleId: vehicles[0].id, customerComplaint: 'Squeaky brakes' });
    assert.equal(r.status, 201); id = r.data.id; assert.equal(r.data.status, 'service_requested');
});
await step('FR-04 unknown customer 404', async () => {
    assert.equal((await call(mgr, 'POST', '/work-orders', { customerId: 99999, vehicleId: 1 })).status, 404);
});
await step('FR-06 assign technician', async () => {
    const r = await call(mgr, 'PATCH', `/work-orders/${id}/technician`, { technicianId: sam.id });
    assert.equal(r.status, 200); assert.equal(r.data.assignedTechnician, sam.id);
});
await step('FR-06 reassign technician is logged', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/technician`, { technicianId: tomUser.id })).status, 200);
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/technician`, { technicianId: sam.id })).status, 200);
    const h = (await call(mgr, 'GET', `/work-orders/${id}/history`)).data;
    assert.ok(h.some((x) => x.note?.includes('reassigned')));
});
await step('FR-06 technician cannot reassign (403)', async () => {
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/technician`, { technicianId: sam.id })).status, 403);
});
await step('FR-07 other technician cannot see the work order', async () => {
    assert.equal((await call(tom, 'GET', `/work-orders/${id}`)).status, 404);
});
await step('FR-05 check in with mileage and notes', async () => {
    const r = await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'checked_in', mileageIn: 90000, conditionNotes: 'Scratch on bumper' });
    assert.equal(r.status, 200); assert.equal(r.data.mileageIn, 90000); assert.equal(r.data.conditionNotes, 'Scratch on bumper');
});
await step('FR-05 mileage lower than last recorded is rejected', async () => {
    const w = await call(mgr, 'POST', '/work-orders', { customerId: maria.id, vehicleId: vehicles[0].id });
    const r = await call(mgr, 'PATCH', `/work-orders/${w.data.id}/status`, { status: 'checked_in', mileageIn: 10 });
    assert.equal(r.status, 400);
});
await step('FR-05 second check-in blocked', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'checked_in' })).status, 400);
});
await step('FR-08 diagnosis only after moving to diagnosis stage', async () => {
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/diagnosis`, { diagnosis: 'x' })).status, 400);
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/status`, { status: 'diagnosis' })).status, 200);
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/diagnosis`, { diagnosis: 'Pads worn', recommendedRepairs: 'Replace pads' })).status, 200);
});
await step('approval request needs a service', async () => {
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/status`, { status: 'customer_approval' })).status, 400);
});
await step('FR-09/15 add service and part, estimate computed', async () => {
    assert.equal((await call(tech, 'POST', `/work-orders/${id}/services`, { serviceId: brake.id })).status, 201);
    const r = await call(tech, 'POST', `/work-orders/${id}/parts`, { partId: pads.id, quantity: 2 });
    assert.equal(r.status, 200);
    const e = r.data.estimate;
    assert.equal(e.parts, 109);
    assert.equal(e.labor, Number(brake.defaultPrice));
    const sub = e.labor + e.parts;
    assert.equal(e.total, Math.round((sub * 1.0825) * 100) / 100);
});
await step('FR-22 estimate notification logged', async () => {
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/status`, { status: 'customer_approval' })).status, 200);
    await new Promise((r) => setTimeout(r, 300));
    const n = (await call(mgr, 'GET', `/work-orders/${id}/notifications`)).data;
    assert.ok(n.some((x) => x.event === 'customer_approval'));
    assert.ok(n.some((x) => x.event === 'service_requested'));
});
await step('FR-23 notifications go by email and are logged, not sent, without live driver', async () => {
    const n = (await call(mgr, 'GET', `/work-orders/${id}/notifications`)).data;
    assert.ok(n.length > 0);
    assert.ok(n.every((x) => x.channel === 'email' && ['logged', 'sent'].includes(x.result)));
});
await step('FR-11 repair blocked before approval', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'in_repair' })).status, 400);
});
await step('FR-10 technician cannot record approval (403)', async () => {
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/status`, { status: 'approved', approvedServiceIds: [brake.id], approvalMethod: 'phone' })).status, 403);
});
await step('FR-10 approval needs a method', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'approved', approvedServiceIds: [brake.id] })).status, 400);
});
await step('FR-10 approval recorded with method, recorder, time', async () => {
    const r = await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'approved', approvedServiceIds: [brake.id], approvalMethod: 'phone' });
    assert.equal(r.status, 200);
    const a = r.data.approvals.at(-1);
    assert.equal(a.method, 'phone'); assert.equal(a.decision, 'approved'); assert.ok(a.recordedBy && a.recordedAt);
    assert.equal(r.data.approvedTotal, r.data.estimate.total);
});
await step('FR-11 repair starts after approval', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'in_repair' })).status, 200);
});
await step('FR-12 adding a service during repair requires new approval', async () => {
    const r = await call(tech, 'POST', `/work-orders/${id}/services`, { serviceId: oil.id });
    assert.equal(r.status, 201); assert.equal(r.data.status, 'customer_approval');
});
await step('FR-12 cannot complete without approval', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'completed' })).status, 400);
});
await step('FR-12 re-approval keeps earlier approved work', async () => {
    const r = await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'approved', approvedServiceIds: [oil.id], approvalMethod: 'email' });
    assert.equal(r.status, 200);
    assert.equal(r.data.services.filter((s) => s.approved).length, 2);
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'in_repair' })).status, 200);
});
await step('FR-12 parts that raise the total need approval; declining extra returns to repair', async () => {
    const r = await call(tech, 'POST', `/work-orders/${id}/parts`, { partId: pads.id, quantity: 1 });
    assert.equal(r.data.status, 'customer_approval');
    const d = await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'in_repair', approvalMethod: 'phone' });
    assert.equal(d.status, 200); assert.equal(d.data.status, 'in_repair');
    assert.equal(d.data.approvals.at(-1).decision, 'declined');
});
await step('FR-13 progress updates then completion', async () => {
    for (const s of [brake, oil]) {
        assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/services/${s.id}/progress`, { progress: 'completed' })).status, 200);
    }
    assert.equal((await call(tech, 'PATCH', `/work-orders/${id}/status`, { status: 'completed' })).status, 200);
});
await step('FR-18 invoice from completed labor and parts', async () => {
    const r = await call(mgr, 'POST', `/work-orders/${id}/invoice`);
    assert.equal(r.status, 201);
    assert.equal(r.data.lines.filter((l) => l.type === 'labor').length, 2);
    assert.equal(r.data.paymentStatus, 'unpaid');
    assert.equal((await call(mgr, 'POST', `/work-orders/${id}/invoice`)).status, 409);
});
await step('technician cannot see invoice (403)', async () => {
    assert.equal((await call(tech, 'GET', `/work-orders/${id}/invoice`)).status, 403);
});
await step('FR-19 invoice PDF', async () => {
    const r = await call(mgr, 'GET', `/work-orders/${id}/invoice/pdf`);
    assert.equal(r.status, 200); assert.equal(r.data.subarray(0, 4).toString(), '%PDF');
});
await step('FR-19 email invoice is logged when no gateway is configured', async () => {
    const r = await call(mgr, 'POST', `/work-orders/${id}/invoice/email`);
    assert.equal(r.status, 200); assert.ok(['logged', 'sent', 'failed'].includes(r.data.result));
});
await step('FR-19 cannot close before payment', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'closed' })).status, 400);
});
await step('FR-19 record payment then close', async () => {
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/invoice/payment`, { status: 'paid' })).status, 400);
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/invoice/payment`, { status: 'paid', method: 'card' })).status, 200);
    assert.equal((await call(mgr, 'PATCH', `/work-orders/${id}/status`, { status: 'closed' })).status, 200);
});
await step('FR-13 status history complete', async () => {
    const h = (await call(mgr, 'GET', `/work-orders/${id}/history`)).data;
    const to = h.map((x) => x.toStatus);
    for (const s of ['service_requested', 'checked_in', 'diagnosis', 'customer_approval', 'approved', 'in_repair', 'completed', 'closed']) assert.ok(to.includes(s), s);
    assert.ok(h.every((x) => x.changedByName && x.changedAt));
});
await step('FR-20/21 vehicle history lists the job, filters by service', async () => {
    const r = await call(mgr, 'GET', `/vehicles/${vehicles[0].id}/history?serviceId=${brake.id}`);
    assert.equal(r.status, 200); assert.ok(JSON.stringify(r.data).includes(`"id":${id}`));
});
await step('FR-14 manager sees work order list', async () => {
    const r = await call(mgr, 'GET', '/work-orders'); assert.ok(r.data.some((w) => w.id === id));
});
await step('FR-25 manager edits, deactivates, and deactivated user is locked out', async () => {
    const created = await call(mgr, 'POST', '/users', { name: 'Temp Tech', pin: '654321', role: 'technician' });
    assert.equal(created.status, 201);
    const code = created.data.employeeCode;
    const tt = await login(code, '654321'); assert.ok(tt);
    assert.equal((await call(mgr, 'PATCH', `/users/${created.data.id}`, { name: 'Temp Tech 2', role: 'manager' })).status, 200);
    assert.equal((await call(mgr, 'PATCH', `/users/${created.data.id}`, { role: 'technician', active: false })).status, 200);
    assert.equal((await call(tt, 'GET', '/work-orders')).status, 401);
    assert.equal(await login(code, '654321'), undefined);
    const all = (await call(mgr, 'GET', '/users?includeInactive=true')).data;
    assert.ok(all.some((u) => u.id === created.data.id && u.active === false));
    assert.ok(!(await call(mgr, 'GET', '/users')).data.some((u) => u.id === created.data.id));
});
await step('FR-25 cannot deactivate a technician with open work / self', async () => {
    await call(mgr, 'POST', '/work-orders', { customerId: maria.id, vehicleId: vehicles[0].id, assignedTechnician: tomUser.id });
    assert.equal((await call(mgr, 'PATCH', `/users/${tomUser.id}`, { active: false })).status, 409);
    const me = (await call(mgr, 'GET', '/users?role=manager')).data[0];
    assert.equal((await call(mgr, 'PATCH', `/users/${me.id}`, { active: false })).status, 400);
    assert.equal((await call(tech, 'PATCH', `/users/${me.id}`, { name: 'x' })).status, 403);
});
await step('FR-26 audit log records actions; PIN never logged; manager only', async () => {
    const a = await call(mgr, 'GET', '/audit?limit=200');
    assert.equal(a.status, 200);
    const actions = new Set(a.data.map((x) => x.action));
    for (const x of ['create', 'approve', 'decline', 'status_change', 'assign_technician', 'payment']) assert.ok(actions.has(x), x);
    assert.ok(!JSON.stringify(a.data).includes('654321'));
    assert.equal((await call(tech, 'GET', '/audit')).status, 403);
});
await step('NFR-08 insert-only history and audit enforced by the database', async () => {
    const { default: prisma } = await import('../server/src/lib/prisma.js');
    await assert.rejects(() => prisma.statusHistory.deleteMany({ where: { workOrderId: id } }));
    await assert.rejects(() => prisma.approval.updateMany({ where: { workOrderId: id }, data: { note: 'x' } }));
    await assert.rejects(() => prisma.auditLog.deleteMany({}));
    await prisma.$disconnect();
});
await step('shop tax rate setting', async () => {
    assert.equal((await call(mgr, 'PATCH', '/shop', { taxRate: 0.5 })).status, 400);
    assert.equal((await call(mgr, 'PATCH', '/shop', { taxRate: 0.0825 })).status, 200);
});
console.log(`\n${passed} passed`);