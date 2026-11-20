// Extra API checks M-01 to M-15 for the requirements the workflow test does not reach:
// customer and vehicle registration, search, VIN rules, role checks and the parts inventory.
// Run against a freshly seeded database (npm run seed) with the server running:
//   npm run test:api from server/  (API_URL defaults to http://localhost:4000/api)
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;

async function call(token, method, path, body) {
    const res = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}
async function step(name, fn) {
    try { await fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
}
async function login(employeeCode, pin) {
    const r = await call(null, 'POST', '/auth/login', { shopId: 1, employeeCode, pin });
    return r.data.token;
}

const mgr = await login(1001, '123456');
const sam = await login(1002, '234567');
const tom = await login(1003, '345678');
const stamp = Date.now() % 10000;
const phone = `555-${String(stamp).padStart(4, '0')}`;
let customerId;
let vehicleId;

// FR-01: register a customer
await step('M-01 save a customer with no name is rejected', async () => {
    const r = await call(mgr, 'POST', '/customers', { name: '', phone });
    assert.equal(r.status, 400);
});
await step('M-02 save a customer with name, phone and email', async () => {
    const r = await call(mgr, 'POST', '/customers', { name: 'Test Person', phone, email: 'test.person@example.com' });
    assert.equal(r.status, 201);
    customerId = r.data.id;
});

// FR-03: search, view and edit
await step('M-03 search customers by phone', async () => {
    const r = await call(mgr, 'GET', `/customers?search=${phone}`);
    assert.ok(r.data.some((c) => c.id === customerId));
});
await step('M-04 search customers by part of the name, any case', async () => {
    const r = await call(mgr, 'GET', '/customers?search=test%20per');
    assert.ok(r.data.some((c) => c.id === customerId));
});
await step('M-05 edit the customer phone', async () => {
    const r = await call(mgr, 'PATCH', `/customers/${customerId}`, { name: 'Test Person', phone: '555-0200', email: 'test.person@example.com' });
    assert.equal(r.status, 200);
    assert.equal(r.data.phone, '555-0200');
});

// FR-02: register vehicles, no duplicate VIN
const vin = '1HGCM82633A' + String(100000 + stamp).slice(-6);
await step('M-06 register a vehicle for the customer', async () => {
    const r = await call(mgr, 'POST', '/vehicles', { customerId, vin, make: 'Honda', model: 'Accord', year: 2003 });
    assert.equal(r.status, 201);
    vehicleId = r.data.id;
});
await step('M-07 the same VIN again does not create a second vehicle', async () => {
    const r = await call(mgr, 'POST', '/vehicles', { customerId, vin, make: 'Honda', model: 'Accord', year: 2003 });
    assert.equal(r.data.id, vehicleId);
    const list = await call(mgr, 'GET', `/customers/${customerId}/vehicles`);
    assert.equal(list.data.length, 1);
});
await step('M-08 an invalid VIN is rejected', async () => {
    const r = await call(mgr, 'POST', '/vehicles', { customerId, vin: 'BADVIN', make: 'Honda', model: 'Accord', year: 2003 });
    assert.equal(r.status, 400);
});

// FR-24: role checks
await step('M-09 technician cannot open the audit log API', async () => {
    assert.equal((await call(sam, 'GET', '/audit')).status, 403);
});
await step('M-10 technician cannot add a part', async () => {
    const r = await call(sam, 'POST', '/parts', { partNumber: 'X-1', name: 'x', price: 1, quantityInStock: 1, reorderLevel: 0 });
    assert.equal(r.status, 403);
});

// FR-16, FR-17: parts inventory and low stock
let cabinFilter;
await step('M-11 low-stock list has only CF-3001 (2 in stock, reorder at 5)', async () => {
    const r = await call(mgr, 'GET', '/parts?lowStock=true');
    assert.deepEqual(r.data.map((p) => p.partNumber), ['CF-3001']);
    cabinFilter = r.data[0];
});
await step('M-12 restock CF-3001 with 10 clears the low-stock flag', async () => {
    const r = await call(mgr, 'POST', `/parts/${cabinFilter.id}/restock`, { quantity: 10 });
    assert.equal(r.data.quantityInStock, 12);
    assert.equal(r.data.lowStock, false);
});
await step('M-13 a request with no token is rejected', async () => {
    assert.equal((await call(null, 'GET', '/customers')).status, 401);
});

const job = (await call(tom, 'GET', '/work-orders')).data.find((w) => w.status === 'diagnosis');
const pads = (await call(mgr, 'GET', '/parts')).data.find((p) => p.partNumber === 'BP-2001');
await step('M-14 recording 2 brake pads lowers stock by 2', async () => {
    const r = await call(tom, 'POST', `/work-orders/${job.id}/parts`, { partId: pads.id, quantity: 2 });
    assert.equal(r.status, 200);
    const after = (await call(mgr, 'GET', '/parts')).data.find((p) => p.id === pads.id);
    assert.equal(after.quantityInStock, pads.quantityInStock - 2);
});
await step('M-15 recording more parts than are in stock is rejected', async () => {
    const r = await call(tom, 'POST', `/work-orders/${job.id}/parts`, { partId: pads.id, quantity: 999 });
    assert.equal(r.status, 400);
});

console.log(`\n${passed} passed, ${failed} failed`);