import { Router } from 'express';
import prisma from '../lib/prisma.js';
import requireRole from '../middleware/requireRole.js';
import { audit } from '../lib/audit.js';

const router = Router();

const PART_FIELDS = {
    id: true,
    partNumber: true,
    name: true,
    description: true,
    price: true,
    quantityInStock: true,
    reorderLevel: true,
};

// FR-17: low when stock is at or below the part's reorder level
const withLowStock = (part) => ({ ...part, lowStock: part.quantityInStock <= part.reorderLevel });

const isWholeNumber = (value, min = 0) => Number.isInteger(value) && value >= min;

// checks the fields shared by add and edit; returns { data } or { error }
function readPart(body, { requireAll }) {
    const data = {};

    if (requireAll || body.partNumber !== undefined) {
        const partNumber = String(body.partNumber ?? '').trim().toUpperCase();
        if (!partNumber) return { error: 'Part number is required' };
        data.partNumber = partNumber;
    }
    if (requireAll || body.name !== undefined) {
        const name = String(body.name ?? '').trim();
        if (!name) return { error: 'Name is required' };
        data.name = name;
    }
    if (body.description !== undefined) {
        data.description = String(body.description ?? '').trim() || null;
    }
    if (requireAll || body.price !== undefined) {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0 || Math.round(price * 100) !== price * 100) {
            return { error: 'Price must be a positive amount with at most 2 decimals' };
        }
        data.price = price;
    }
    if (requireAll || body.reorderLevel !== undefined) {
        const reorderLevel = Number(body.reorderLevel);
        if (!isWholeNumber(reorderLevel)) return { error: 'Reorder level must be a whole number of 0 or more' };
        data.reorderLevel = reorderLevel;
    }
    // stock is set when adding a part, or corrected after a stock count
    if (requireAll || body.quantityInStock !== undefined) {
        const quantityInStock = Number(body.quantityInStock ?? 0);
        if (!isWholeNumber(quantityInStock)) return { error: 'Quantity in stock must be a whole number of 0 or more' };
        data.quantityInStock = quantityInStock;
    }
    return { data };
}

// the part, only if it belongs to the user's shop
async function findPart(req, res) {
    const id = Number(req.params.id);
    const part = Number.isInteger(id)
        ? await prisma.part.findFirst({ where: { id, shopId: req.user.shopId }, select: PART_FIELDS })
        : null;
    if (!part) res.status(404).json({ error: 'Part not found' });
    return part;
}

// FR-16: list parts. ?search= filters by name or number, ?lowStock=true shows only low parts (FR-17)
router.get('/', async (req, res) => {
    const search = String(req.query.search ?? '').trim();
    const lowOnly = req.query.lowStock === 'true';

    try {
        const parts = await prisma.part.findMany({
            where: {
                shopId: req.user.shopId,
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { partNumber: { contains: search, mode: 'insensitive' } },
                    ],
                }),
                // compares two columns of the same row
                ...(lowOnly && { quantityInStock: { lte: prisma.part.fields.reorderLevel } }),
            },
            orderBy: { name: 'asc' },
            select: PART_FIELDS,
        });
        res.json(parts.map(withLowStock));
    } catch (err) {
        res.status(500).json({ error: 'Could not load parts' });
    }
});

// FR-16: add a part to the inventory
router.post('/', requireRole('manager'), async (req, res) => {
    const { data, error } = readPart(req.body ?? {}, { requireAll: true });
    if (error) return res.status(400).json({ error });

    try {
        const part = await prisma.$transaction(async (tx) => {
            const created = await tx.part.create({
                data: { ...data, shopId: req.user.shopId },
                select: PART_FIELDS,
            });
            await audit(req.user, 'create', 'part', created.id, {
                partNumber: created.partNumber,
                quantityInStock: created.quantityInStock,
            }, tx);
            return created;
        });
        res.status(201).json(withLowStock(part));
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'That part number is already in use' });
        res.status(500).json({ error: 'Could not add part' });
    }
});

// FR-16: edit a part's details, or correct its stock after a count
router.patch('/:id', requireRole('manager'), async (req, res) => {
    const { data, error } = readPart(req.body ?? {}, { requireAll: false });
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to change' });

    try {
        const part = await findPart(req, res);
        if (!part) return;

        const updated = await prisma.$transaction(async (tx) => {
            const saved = await tx.part.update({ where: { id: part.id }, data, select: PART_FIELDS });
            const changes = Object.fromEntries(
                Object.keys(data)
                    .filter((key) => String(part[key]) !== String(saved[key]))
                    .map((key) => [key, { from: part[key], to: saved[key] }])
            );
            await audit(req.user, 'update', 'part', part.id, changes, tx);
            return saved;
        });
        res.json(withLowStock(updated));
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'That part number is already in use' });
        res.status(500).json({ error: 'Could not save part' });
    }
});

// FR-16: receive new stock. Adds to the current count, so it is safe while parts are being used.
router.post('/:id/restock', requireRole('manager'), async (req, res) => {
    const quantity = Number(req.body?.quantity);
    if (!isWholeNumber(quantity, 1)) {
        return res.status(400).json({ error: 'Quantity must be a whole number of at least 1' });
    }

    try {
        const part = await findPart(req, res);
        if (!part) return;

        const updated = await prisma.$transaction(async (tx) => {
            const saved = await tx.part.update({
                where: { id: part.id },
                data: { quantityInStock: { increment: quantity } },
                select: PART_FIELDS,
            });
            await audit(req.user, 'restock', 'part', part.id, {
                quantity,
                from: part.quantityInStock,
                to: saved.quantityInStock,
            }, tx);
            return saved;
        });
        res.json(withLowStock(updated));
    } catch (err) {
        res.status(500).json({ error: 'Could not restock part' });
    }
});

export default router;