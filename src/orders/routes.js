import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { parsePositiveInteger } from '../common/numbers.js';
import { validateOrder } from './validation.js';
import { createOrder, orderInclude, serializeOrder } from './service.js';

export const orderRouter = Router();
orderRouter.use(requireAuth);
orderRouter.use(requireRole('ADMIN', 'normal'));
orderRouter.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

orderRouter.post('/', requireRole('normal'), async (req, res) => {
  const items = validateOrder(req.body);
  if (!items) return res.status(400).json({ message: 'Chỉ gửi items, gồm 1-50 sản phẩm không trùng pid. Mỗi dòng chỉ có pid nguyên dương và qty nguyên từ 1 đến 1000000.' });
  const order = await createOrder(req.user.uid, items);
  res.location(`/api/orders/${order.oid}`);
  res.status(201).json({ order: serializeOrder(order) });
});

orderRouter.get('/', async (req, res) => {
  if (Object.keys(req.query).some(key => !['page', 'limit'].includes(key))) return res.status(400).json({ message: 'Chỉ hỗ trợ page và limit.' });
  const page = parsePositiveInteger(req.query.page ?? '1', 100000);
  const limit = parsePositiveInteger(req.query.limit ?? '20', 100);
  if (page === null || limit === null) return res.status(400).json({ message: 'page phải từ 1 đến 100000; limit phải từ 1 đến 100.' });
  const where = req.user.role.rolename === 'ADMIN' ? {} : { uid: req.user.uid };
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { oid: 'desc' }, include: orderInclude }),
    prisma.order.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data: orders.map(serializeOrder), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

orderRouter.get('/:oid', async (req, res) => {
  const oid = parsePositiveInteger(req.params.oid);
  if (oid === null) return res.status(400).json({ message: 'oid phải là số nguyên dương hợp lệ.' });
  const where = req.user.role.rolename === 'ADMIN' ? { oid } : { oid, uid: req.user.uid };
  const order = await prisma.order.findFirst({ where, include: orderInclude });
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
  res.json({ order: serializeOrder(order) });
});
