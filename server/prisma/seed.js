// run: node prisma/seed.js
import bcrypt from 'bcrypt';
import prisma from '../src/lib/prisma.js';

async function main() {
  // delete in reverse-dependency order so the seed is re-runnable
  await prisma.workOrderService.deleteMany();
  await prisma.workOrderPart.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.customerVehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.service.deleteMany();
  await prisma.part.deleteMany();
  await prisma.shopUser.deleteMany();
  await prisma.user.deleteMany();
  await prisma.shop.deleteMany();

  const hash = (pin) => bcrypt.hash(pin, 10);

  // shops
  const shopA = await prisma.shop.create({
    data: {
      name: 'Bobs Auto Care', address: '100 Main St', phone: '817-555-0101', email: 'a@example.com',
      nextEmployeeNumber: 1004,
    },
  });
  const shopB = await prisma.shop.create({
    data: {
      name: 'Freds Garage', address: '200 Oak Ave', phone: '817-555-0202', email: 'b@example.com',
      nextEmployeeNumber: 1003,
    },
  });

  // users
  const jane = await prisma.user.create({ data: { name: 'Jane Manager', pinHash: await hash('123456') } });
  const sam = await prisma.user.create({ data: { name: 'Sam Technician', pinHash: await hash('234567') } });
  const tom = await prisma.user.create({ data: { name: 'Tom Technician', pinHash: await hash('345678') } });
  const rita = await prisma.user.create({ data: { name: 'Rita Technician', pinHash: await hash('456789') } });

  // memberships (Jane works at both shops with different employee codes)
  await prisma.shopUser.createMany({
    data: [
      { shopId: shopA.id, userId: jane.id, role: 'manager',    employeeCode: 1001 },
      { shopId: shopA.id, userId: sam.id,  role: 'technician',    employeeCode: 1002 },
      { shopId: shopA.id, userId: tom.id,  role: 'technician', employeeCode: 1003 },
      { shopId: shopB.id, userId: jane.id, role: 'manager',    employeeCode: 1001 },
      { shopId: shopB.id, userId: rita.id, role: 'technician', employeeCode: 1002 },
    ],
  });

  // customers (Maria uses both shops and exists as a separate row at each shop)
  const mariaA = await prisma.customer.create({
    data: { shopId: shopA.id, name: 'Maria Lopez', phone: '555-1001', email: 'maria@example.com', preferredContactMethod: 'sms' },
  });
  const davidA = await prisma.customer.create({
    data: { shopId: shopA.id, name: 'David Chen', phone: '555-1002', email: 'david@example.com', preferredContactMethod: 'email' },
  });
  const mariaB = await prisma.customer.create({
    data: { shopId: shopB.id, name: 'Maria Lopez', phone: '555-1001', email: 'maria@example.com', preferredContactMethod: 'email' },
  });

  // vehicles (global; VIN unique across the platform)
  const camry = await prisma.vehicle.create({
    data: { vin: '4T1BF1FK5HU123456', make: 'Toyota', model: 'Camry', year: 2017 },
  });
  const f150 = await prisma.vehicle.create({
    data: { vin: '1FTFW1E50JFA12345', make: 'Ford', model: 'F-150', year: 2018 },
  });

  // customer to vehicle links (must exist before a work order can use the pair)
  await prisma.customerVehicle.createMany({
    data: [
      { customerId: mariaA.id, vehicleId: camry.id },
      { customerId: davidA.id, vehicleId: f150.id },
      { customerId: mariaB.id, vehicleId: camry.id },
    ],
  });

  // parts (per shop)
  const oilFilterA = await prisma.part.create({
    data: { shopId: shopA.id, partNumber: 'OF-1001', name: 'Oil Filter', description: 'Standard spin-on filter', price: 8.99, quantityInStock: 40 },
  });
  const brakePadsA = await prisma.part.create({
    data: { shopId: shopA.id, partNumber: 'BP-2001', name: 'Front Brake Pads', description: 'Ceramic, set of 4', price: 54.5, quantityInStock: 12 },
  });
  const oilFilterB = await prisma.part.create({
    data: { shopId: shopB.id, partNumber: 'OF-1001', name: 'Oil Filter', description: 'Standard spin-on filter', price: 9.49, quantityInStock: 15 },
  });

  // services (per shop)
  const oilChangeA = await prisma.service.create({
    data: { shopId: shopA.id, name: 'Oil Change', description: 'Drain, replace filter, refill', defaultPrice: 49.99 },
  });
  const brakeJobA = await prisma.service.create({
    data: { shopId: shopA.id, name: 'Front Brake Replacement', description: 'Pads and rotor inspection', defaultPrice: 149.0 },
  });
  const oilChangeB = await prisma.service.create({
    data: { shopId: shopB.id, name: 'Oil Change', description: 'Drain, replace filter, refill', defaultPrice: 54.99 },
  });

  // work orders (shopId must match the customer's shop; creator must be a member of that shop)
  const wo1 = await prisma.workOrder.create({
    data: {
      shopId: shopA.id,
      customerId: mariaA.id,
      vehicleId: camry.id,
      createdBy: sam.id,
      assignedTechnician: tom.id,
      status: 'completed',
      mileageIn: 84210,
      customerComplaint: 'Due for oil change',
      diagnosis: 'Oil dark, filter clogged',
      notes: 'Recommended brake check next visit',
      completedAt: new Date(),
    },
  });
  const wo2 = await prisma.workOrder.create({
    data: {
      shopId: shopA.id,
      customerId: davidA.id,
      vehicleId: f150.id,
      createdBy: sam.id,
      assignedTechnician: tom.id,
      status: 'in_progress',
      mileageIn: 61500,
      customerComplaint: 'Squealing when braking',
    },
  });
  const wo3 = await prisma.workOrder.create({
    data: {
      shopId: shopB.id,
      customerId: mariaB.id,
      vehicleId: camry.id,
      createdBy: jane.id, // Jane is a manager at shop B too
      assignedTechnician: rita.id,
      status: 'open',
      mileageIn: 85000,
      customerComplaint: 'Oil change',
    },
  });

  // parts (shopId must match the work order AND the part/service)
  await prisma.workOrderPart.createMany({
    data: [
      { shopId: shopA.id, workOrderId: wo1.id, partId: oilFilterA.id, quantity: 1, unitPrice: 8.99 },
      { shopId: shopA.id, workOrderId: wo2.id, partId: brakePadsA.id, quantity: 1, unitPrice: 54.5 },
      { shopId: shopB.id, workOrderId: wo3.id, partId: oilFilterB.id, quantity: 1, unitPrice: 9.49 },
    ],
  });

  // services
  await prisma.workOrderService.createMany({
    data: [
      { shopId: shopA.id, workOrderId: wo1.id, serviceId: oilChangeA.id, price: 49.99, notes: '5W-30 synthetic' },
      { shopId: shopA.id, workOrderId: wo2.id, serviceId: brakeJobA.id, price: 149.0 },
      { shopId: shopB.id, workOrderId: wo3.id, serviceId: oilChangeB.id, price: 54.99 },
    ],
  });

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());