import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { HttpError } from '../common/errors.js';

export const orderInclude = {
  details: { orderBy: { pid: 'asc' }, include: { product: { select: { pname: true } } } },
  shipments: { orderBy: { shipid: 'asc' } },
};

export function serializeOrder(order) {
  let total = new Prisma.Decimal(0);
  const items = order.details.map(detail => {
    const subtotal = detail.unit_price.mul(detail.qty);
    total = total.add(subtotal);
    return { pid: detail.pid, pname: detail.product.pname, qty: detail.qty, unit_price: detail.unit_price.toFixed(2), subtotal: subtotal.toFixed(2) };
  });
  return { oid: order.oid, uid: order.uid, createat: order.createat.toISOString(), items, total: total.toFixed(2), shipments: order.shipments };
}

export async function createOrder(uid, items) {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const products = await tx.product.findMany({ where: { pid: { in: items.map(item => item.pid) } } });
        const productById = new Map(products.map(product => [product.pid, product]));
        if (products.length !== items.length) throw new HttpError(404, 'Một hoặc nhiều sản phẩm không tồn tại.');
        const details = [];
        for (const item of items) {
          const product = productById.get(item.pid);
          const updated = await tx.product.updateMany({
            where: { pid: item.pid, quantity: { gte: item.qty } },
            data: { quantity: { decrement: item.qty } },
          });
          if (updated.count !== 1) throw new HttpError(409, `Sản phẩm ${item.pid} không đủ tồn kho.`);
          details.push({ pid: item.pid, qty: item.qty, unit_price: product.price });
        }
        return await tx.order.create({ data: { uid, details: { create: details } }, include: orderInclude });
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 });
    } catch (err) {
      if (err.code === 'P2034') {
        if (attempt === maxAttempts - 1) throw new HttpError(409, 'Đơn hàng xung đột với giao dịch khác. Vui lòng thử lại.');
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      if (err.code === 'P2003') throw new HttpError(409, 'Dữ liệu liên quan đã thay đổi. Vui lòng thử lại.');
      throw err;
    }
  }
}
