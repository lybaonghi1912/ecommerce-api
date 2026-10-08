import express from 'express';
import { authRouter } from './auth/routes.js';
import { requireAuth } from './auth/middleware.js';
import { productRouter } from './products/routes.js';
import { orderRouter } from './orders/routes.js';
import { HttpError } from './common/errors.js';
import { prisma } from './prisma.js';
import { shipmentCreationRouter, shipmentRouter } from './shipments/routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/orders/:oid/shipments', shipmentCreationRouter);
app.use('/api/shipments', shipmentRouter);
app.use('/api/orders', orderRouter);
app.get('/api/users/me', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ user: req.user });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Không tìm thấy endpoint.' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON không hợp lệ.' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn.' });
  }

  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });

  console.error(err);
  res.status(500).json({ message: 'Lỗi hệ thống.' });
});





