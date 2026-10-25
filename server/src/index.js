// route handlers
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import prisma from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import authenticate from './middleware/authenticate.js';
import workOrderRoutes from './routes/workOrders.js';
import vehicleRoutes from './routes/vehicles.js';
import userRoutes from './routes/users.js';
import partRoutes from './routes/parts.js';

const app = express();
// allows browser based requests from vite
app.use(cors());
// lets Express parse incoming JSON request bodies so routes can read req.body
app.use(express.json());

// connects route handlers to URL prefix and mounts middleware for login tokens
app.use('/api/auth', authRoutes);
app.use('/api/customers', authenticate, customerRoutes);
app.use('/api/work-orders', authenticate, workOrderRoutes);
app.use('/api/vehicles', authenticate, vehicleRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/parts', authenticate, partRoutes);

app.get('/health', async (req, res) => {
  try {
    const shopCount = await prisma.shop.count();
    res.json({ status: 'ok', shopCount });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// start server on PORT (default to 4000)
app.listen(process.env.PORT || 4000, () => console.log('API running'));