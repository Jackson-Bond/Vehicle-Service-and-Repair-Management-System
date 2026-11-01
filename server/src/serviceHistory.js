import prisma from './lib/prisma.js';


const APPROVED_STAGES = ['approved', 'in_repair', 'completed', 'closed'];

export function historyFilter(query) {
    const filter = {};
    const createdAt = {};

    if (query.from) {
        const from = new Date(`${query.from}T00:00:00`);
        if (Number.isNaN(from.getTime())) return { error: 'Invalid start date' };
        createdAt.gte = from;
    }
    if (query.to) {
        const to = new Date(`${query.to}T00:00:00`);
        if (Number.isNaN(to.getTime())) return { error: 'Invalid end date' };
        to.setDate(to.getDate() + 1); // include the whole end day
        createdAt.lt = to;
    }
    if (createdAt.gte && createdAt.lt && createdAt.gte >= createdAt.lt) {
        return { error: 'Start date must be on or before the end date' };
    }
    if (createdAt.gte || createdAt.lt) filter.createdAt = createdAt;

    if (query.serviceId) {
        const serviceId = Number(query.serviceId);
        if (!Number.isInteger(serviceId)) return { error: 'Invalid service' };
        filter.services = { some: { serviceId } };
    }

    return { filter };
}

export async function loadHistory(user, where) {
    const workOrders = await prisma.workOrder.findMany({
        where: {
            ...where,
            shopId: user.shopId,
            ...(user.role === 'technician' && { assignedTechnician: user.userId }),
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            mileageIn: true,
            customerComplaint: true,
            customer: { select: { id: true, name: true } },
            vehicle: { select: { id: true, year: true, make: true, model: true, vin: true } },
            technician: { select: { name: true } },
            services: {
                select: { serviceId: true, price: true, approved: true, service: { select: { name: true } } },
                orderBy: { serviceId: 'asc' },
            },
            parts: { select: { quantity: true, unitPrice: true } },
        },
    });

    return workOrders.map((wo) => {
        const billed = APPROVED_STAGES.includes(wo.status)
            ? wo.services.filter((line) => line.approved)
            : wo.services;
        const partsTotal = wo.parts.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
        const servicesTotal = billed.reduce((sum, line) => sum + Number(line.price), 0);

        return {
            id: wo.id,
            status: wo.status,
            createdAt: wo.createdAt,
            completedAt: wo.completedAt,
            mileageIn: wo.mileageIn,
            customerComplaint: wo.customerComplaint,
            customer: wo.customer,
            vehicle: wo.vehicle,
            technician: wo.technician,
            services: billed.map((line) => ({ id: line.serviceId, name: line.service.name })),
            total: Number((partsTotal + servicesTotal).toFixed(2)),
        };
    });
}