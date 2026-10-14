import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import prisma from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import authenticate from './middleware/authenticate.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/customers', authenticate, customerRoutes);

app.get('/health', async (req, res) => {
  try {
    const shopCount = await prisma.shop.count();
    res.json({ status: 'ok', shopCount });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.listen(process.env.PORT || 4000, () => console.log('API running'));