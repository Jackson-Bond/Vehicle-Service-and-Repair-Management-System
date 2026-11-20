import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimate } from '../server/src/estimate.js';

test('labor 200 + parts 150 at 8.25% totals 378.88', () => {
    const e = calculateEstimate({
        services: [{ price: '200.00' }],
        parts: [{ unitPrice: '75.00', quantity: 2 }],
        taxRate: 0.0825,
    });
    assert.equal(e.subtotal, 350);
    assert.equal(e.tax, 28.88);
    assert.equal(e.total, 378.88);
});

test('empty estimate is zero', () => {
    assert.equal(calculateEstimate({ taxRate: 0.0825 }).total, 0);
});

test('zero tax rate adds no tax', () => {
    assert.equal(calculateEstimate({ services: [{ price: 19.99 }], taxRate: 0 }).total, 19.99);
});