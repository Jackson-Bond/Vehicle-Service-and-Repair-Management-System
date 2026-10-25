import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
    const search = String(req.query.search ?? '').trim();

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
            },
            orderBy: { name: 'asc' },
            select: { id: true, partNumber: true, name: true, price: true, quantityInStock: true },
        });
        res.json(parts);
    } catch (err) {
        res.status(500).json({ error: 'Could not load parts' });
    }
});

export default router;