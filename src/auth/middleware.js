import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { publicUserSelect } from './validation.js';

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Bearer');
  return res.status(401).json({ message: 'Cần token hợp lệ và còn hạn.' });
}

export async function requireAuth(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
  if (!match) return unauthorized(res);
  let payload;
  try {
    payload = jwt.verify(match[1], config.jwtSecret, {
      algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience,
    });
  } catch {
    return unauthorized(res);
  }
  if (typeof payload !== 'object' || !Number.isFinite(payload.exp) || typeof payload.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub)) return unauthorized(res);
  const uid = Number(payload.sub);
  if (!Number.isSafeInteger(uid) || uid > 2147483647) return unauthorized(res);
  const user = await prisma.user.findUnique({ where: { uid }, select: publicUserSelect });
  if (!user) return unauthorized(res);
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!roles.includes(req.user.role.rolename)) return res.status(403).json({ message: 'Không có quyền thực hiện thao tác.' });
    next();
  };
}
