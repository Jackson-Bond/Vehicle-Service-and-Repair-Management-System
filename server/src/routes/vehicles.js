import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { historyFilter, loadHistory } from '../serviceHistory.js';

const router = Router();

// 17 characters, letters and digits, no: I, O and Q
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

// shared by register and edit: returns an error message or null
function validateVehicle({ make, model, year }) {
  const yearNum = Number(year);
  if (!make?.trim() || !model?.trim()) return 'Enter make and model';
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
    return 'Invalid year';
  }
  return null;
}

async function findShopVehicle(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { customers: { include: { customer: true } } },
  });
  if (!vehicle) return null;

  const owners = vehicle.customers
    .map((link) => link.customer)
    .filter((customer) => customer.shopId === req.user.shopId);
  if (owners.length === 0) return null;

  const { customers, ...rest } = vehicle;
  return {
    ...rest,
    owners: owners.map(({ id, name, phone, email }) => ({ id, name, phone, email })),
    sharedWithOtherShop: owners.length < customers.length,
  };
}

router.post('/', async (req, res) => {

  const { customerId, make, model, year } = req.body ?? {};
  const vin = String(req.body?.vin ?? '').trim().toUpperCase();
  const yearNum = Number(year);

  if (!VIN_PATTERN.test(vin)) {
    return res.status(400).json({ error: 'VIN must be 17 characters (no I, O or Q)' });
  }
  if (!make?.trim() || !model?.trim()) {
    return res.status(400).json({ error: 'Enter make and model' });
  }
  if (!Number.isInteger(yearNum) || yearNum > new Date().getFullYear() + 1) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  // customer must belong to shop
  const customer = await prisma.customer.findFirst({
    where: { id: Number(customerId), shopId: req.user.shopId },
  });
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
    

  try {
    const vehicle = await prisma.$transaction(async (tx) => {
      // If the VIN exists (possibly from another shop), reuse it unchanged
      let v = await tx.vehicle.findUnique({ where: { vin } });
      if (!v) {
        v = await tx.vehicle.create({
          data: { vin, make: make.trim(), model: model.trim(), year: yearNum },
        });
      }

      // Link to the customer; upsert makes repeat registration harmless
      await tx.customerVehicle.upsert({
        where: { customerId_vehicleId: { customerId: customer.id, vehicleId: v.id } },
        create: { customerId: customer.id, vehicleId: v.id },
        update: {},
      });
      return v;
    });

    res.status(201).json(vehicle);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Vehicle was just registered, please retry' });
    }
    res.status(500).json({ error: 'Could not Save Vehicle' });
  }
});

// vehicle details with this shop's owners
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await findShopVehicle(req);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Could not load vehicle' });
  }
});

// The vehicle's service history at this shop, optionally filtered
router.get('/:id/history', async (req, res) => {
  const { filter, error } = historyFilter(req.query);
  if (error) return res.status(400).json({ error });

  try {
    const vehicle = await findShopVehicle(req);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    res.json(await loadHistory(req.user, { vehicleId: vehicle.id, ...filter }));
  } catch (err) {
    res.status(500).json({ error: 'Could not load service history' });
  }
});

// Correct make, model or year.The VIN identifies the vehicle, so it can't be edited.
router.patch('/:id', async (req, res) => {
  const invalid = validateVehicle(req.body ?? {});
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const vehicle = await findShopVehicle(req);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    // another shop also has this vehicle on file, so don't change their record
    if (vehicle.sharedWithOtherShop) {
      return res.status(409).json({ error: 'This vehicle is also on file at another shop, so it can\'t be edited here' });
    }

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        make: req.body.make.trim(),
        model: req.body.model.trim(),
        year: Number(req.body.year),
      },
    });
    res.json(await findShopVehicle(req));
  } catch (err) {
    res.status(500).json({ error: 'Could not save vehicle' });
  }
});

export default router;