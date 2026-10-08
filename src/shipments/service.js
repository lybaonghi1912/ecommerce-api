import { prisma } from '../prisma.js';
import { HttpError } from '../common/errors.js';
import { nextShipmentStatuses } from './validation.js';

export async function createShipment(oid) {
  const order = await prisma.order.findUnique({ where: { oid }, select: { oid: true } });
  if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
  try {
    return await prisma.shipment.create({ data: { oid, status: 'PENDING' } });
  } catch (err) {
    if (err.code === 'P2003') throw new HttpError(404, 'Đơn hàng không còn tồn tại.');
    throw err;
  }
}

export async function updateShipment(shipid, status) {
  const current = await prisma.shipment.findUnique({ where: { shipid } });
  if (!current) throw new HttpError(404, 'Không tìm thấy shipment.');
  if (current.status === status) return current;
  if (!nextShipmentStatuses[current.status]?.includes(status)) {
    throw new HttpError(409, `Không thể chuyển shipment từ ${current.status} sang ${status}.`);
  }
  try {
    // Atomic condition prevents overwriting a concurrent status update.
    return await prisma.shipment.update({
      where: { shipid, status: current.status },
      data: { status },
    });
  } catch (err) {
    if (err.code === 'P2025') throw new HttpError(409, 'Shipment đã thay đổi. Hãy đọc lại đơn hàng và thử lại.');
    throw err;
  }
}
