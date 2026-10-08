export const shipmentStatuses = ['PENDING', 'SHIPPED', 'DELIVERED', 'FAILED'];

export const nextShipmentStatuses = {
  PENDING: ['SHIPPED'],
  SHIPPED: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
};

export function validateShipmentCreate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (Object.keys(body).some(key => key !== 'status')) return false;
  return !Object.hasOwn(body, 'status') || body.status === 'PENDING';
}

export function validateShipmentUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'status')) return null;
  return shipmentStatuses.includes(body.status) ? body.status : null;
}
