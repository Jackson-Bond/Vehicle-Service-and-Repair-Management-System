import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// 17 characters, letters and digits, no: I, O and Q
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

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

export default router;