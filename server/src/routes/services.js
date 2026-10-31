import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { shopId: req.user.shopId },
      orderBy: { name: 'asc' },
    });
    res.json(services);
  } 
  catch (err) {
    res.status(500).json({ error: 'Could not load services' });
  }
});

export default router;