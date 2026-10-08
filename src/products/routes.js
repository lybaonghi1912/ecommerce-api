import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { parsePositiveInteger, validateProduct, serializeProduct } from './validation.js';

export const productRouter = Router();

productRouter.get('/', async (req, res) => {
  if (Object.keys(req.query).some(key => !['page', 'limit'].includes(key))) {
    return res.status(400).json({ message: 'Chỉ hỗ trợ tham số page và limit.' });
  }
  const page = parsePositiveInteger(req.query.page ?? '1', 100000);
  const limit = parsePositiveInteger(req.query.limit ?? '20', 100);
  if (page === null || limit === null) {
    return res.status(400).json({ message: 'page phải từ 1 đến 100000; limit phải từ 1 đến 100.' });
  }
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { pid: 'asc' } }),
    prisma.product.count(),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data: products.map(serializeProduct), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

productRouter.get('/:pid', async (req, res) => {
  const pid = parsePositiveInteger(req.params.pid);
  if (pid === null) return res.status(400).json({ message: 'pid phải là số nguyên dương hợp lệ.' });
  const product = await prisma.product.findUnique({ where: { pid } });
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  res.json({ product: serializeProduct(product) });
});

productRouter.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const data = validateProduct(req.body);
  if (!data) return res.status(400).json({ message: 'Cần pname (1-100 ký tự), price (chuỗi số không âm, tối đa 99999999.99, không quá 2 chữ số thập phân), quantity (số nguyên không âm). Không nhận trường khác.' });
  const product = await prisma.product.create({ data });
  res.location(`/api/products/${product.pid}`);
  res.status(201).json({ product: serializeProduct(product) });
});

productRouter.patch('/:pid', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const pid = parsePositiveInteger(req.params.pid);
  if (pid === null) return res.status(400).json({ message: 'pid phải là số nguyên dương hợp lệ.' });
  const data = validateProduct(req.body, true);
  if (!data) return res.status(400).json({ message: 'Gửi ít nhất một trường hợp lệ: pname, price hoặc quantity. Không nhận trường khác.' });
  try {
    const product = await prisma.product.update({ where: { pid }, data });
    res.json({ product: serializeProduct(product) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    throw err;
  }
});
