import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { publicUserSelect, validateCredentials } from './validation.js';

export const authRouter = Router();
const dummyHash = bcrypt.hash(randomBytes(24).toString('hex'), 12);

authRouter.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.' },
}));

authRouter.post('/register', async (req, res) => {
  const input = validateCredentials(req.body, true);
  if (!input) return res.status(400).json({ message: 'Chỉ nhận username, fullname, password. Username 3-50 ký tự chữ/số/gạch dưới; fullname 1-100 ký tự; password ít nhất 12 ký tự và tối đa 72 byte.' });
  const role = await prisma.role.findUnique({ where: { rolename: 'normal' } });
  const membership = await prisma.membership.findUnique({ where: { mname: 'BASIC' } });
  if (!role || !membership) return res.status(503).json({ message: 'Hệ thống chưa có dữ liệu cấu hình tài khoản.' });
  const hash = await bcrypt.hash(input.password, 12);
  try {
    const user = await prisma.user.create({
      data: { username: input.username, fullname: input.fullname, password: hash, roleid: role.roleid, mid: membership.mid },
      select: publicUserSelect,
    });
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Username đã tồn tại.' });
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const input = validateCredentials(req.body);
  if (!input) return res.status(400).json({ message: 'Username hoặc định dạng password không hợp lệ.' });
  const user = await prisma.user.findUnique({ where: { username: input.username }, include: { role: true, membership: true } });
  const matches = await bcrypt.compare(input.password, user?.password ?? await dummyHash);
  if (!user || !matches) return res.status(401).json({ message: 'Username hoặc mật khẩu không đúng.' });
  const accessToken = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256', subject: String(user.uid), expiresIn: config.jwtExpiresInSeconds,
    issuer: config.jwtIssuer, audience: config.jwtAudience,
  });
  res.set('Cache-Control', 'no-store');
  res.json({
    accessToken, tokenType: 'Bearer', expiresIn: config.jwtExpiresInSeconds,
    user: { uid: user.uid, username: user.username, fullname: user.fullname, role: { rolename: user.role.rolename }, membership: { mname: user.membership.mname, score: user.membership.score } },
  });
});
