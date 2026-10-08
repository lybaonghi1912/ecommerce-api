import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { parsePositiveInteger } from '../common/numbers.js';
import { createShipment, updateShipment } from './service.js';
import { validateShipmentCreate, validateShipmentUpdate } from './validation.js';

export const shipmentCreationRouter = Router({ mergeParams: true });
shipmentCreationRouter.use(requireAuth, requireRole('ADMIN'));
shipmentCreationRouter.post('/', async (req, res) => {
  const oid = parsePositiveInteger(req.params.oid);
  if (oid === null) return res.status(400).json({ message: 'oid phải là số nguyên dương hợp lệ.' });
  if (!validateShipmentCreate(req.body)) return res.status(400).json({ message: 'Gửi {} hoặc { "status": "PENDING" }. Không nhận trường khác.' });
  const shipment = await createShipment(oid);
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ shipment });
});

export const shipmentRouter = Router();
shipmentRouter.use(requireAuth, requireRole('ADMIN'));
shipmentRouter.patch('/:shipid', async (req, res) => {
  const shipid = parsePositiveInteger(req.params.shipid);
  if (shipid === null) return res.status(400).json({ message: 'shipid phải là số nguyên dương hợp lệ.' });
  const status = validateShipmentUpdate(req.body);
  if (!status) return res.status(400).json({ message: 'Chỉ gửi status: PENDING, SHIPPED, DELIVERED hoặc FAILED.' });
  const shipment = await updateShipment(shipid, status);
  res.set('Cache-Control', 'no-store');
  res.json({ shipment });
});
