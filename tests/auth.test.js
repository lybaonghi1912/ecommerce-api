import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { config } from '../src/config.js';
import { requireAuth, requireRole } from '../src/auth/middleware.js';

test('HTTP authentication, JWT and authorization against development database', { timeout: 60000 }, async t => {
  const wrapper = express();
  wrapper.get('/__test/admin', requireAuth, requireRole('ADMIN'), (req, res) => res.json({ ok: true }));
  wrapper.use(app);
  const server = wrapper.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const username = 'auth_test_' + randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');
  const userCountBefore = await prisma.user.count();

  const send = (method, path, body, token, raw = false) => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : raw ? body : JSON.stringify(body);
    const headers = {};
    if (data !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => text += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')));
    req.end(data);
  });
  const credentials = { username, password, fullname: 'Temporary auth verification' };
  let uid;
  let token;
  try {
    await t.test('input validation, forged role and malformed JSON', async () => {
      assert.equal((await send('POST', '/api/auth/register', { ...credentials, roleid: 1 })).status, 400);
      assert.equal((await send('POST', '/api/auth/register', { ...credentials, password: 'short' })).status, 400);
      assert.equal((await send('POST', '/api/auth/register', { ...credentials, password: 'ắ'.repeat(25) })).status, 400);
      assert.equal((await send('POST', '/api/auth/login', '{broken', undefined, true)).status, 400);
    });
    await t.test('register customer, hash password, reject duplicate', async () => {
      const result = await send('POST', '/api/auth/register', credentials);
      assert.equal(result.status, 201);
      uid = result.body.user.uid;
      assert.equal(result.body.user.role.rolename, 'normal');
      assert.equal(result.body.user.membership.mname, 'BASIC');
      assert.equal(result.body.user.membership.score, 10);
      assert.ok(!('password' in result.body.user));
      const stored = await prisma.user.findUniqueOrThrow({ where: { uid } });
      assert.notEqual(stored.password, password);
      assert.ok(await bcrypt.compare(password, stored.password));
      assert.equal((await send('POST', '/api/auth/register', credentials)).status, 409);
    });
    await t.test('wrong credentials, login, JWT claims, admin login', async () => {
      assert.equal((await send('POST', '/api/auth/login', { username, password: 'wrong-password-long-enough' })).status, 401);
      assert.equal((await send('POST', '/api/auth/login', { username: 'missing_' + randomBytes(8).toString('hex'), password })).status, 401);
      const result = await send('POST', '/api/auth/login', { username, password });
      assert.equal(result.status, 200);
      assert.equal(result.body.user.role.rolename, 'normal');
      assert.equal(result.body.user.membership.score, 10);
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.ok(!('password' in result.body.user));
      token = result.body.accessToken;
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience });
      assert.equal(payload.sub, String(uid));
      assert.equal(payload.exp - payload.iat, config.jwtExpiresInSeconds);
      const admin = await send('POST', '/api/auth/login', { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
      assert.equal(admin.status, 200);
      assert.equal((await send('GET', '/__test/admin', undefined, admin.body.accessToken)).status, 200);
    });
    await t.test('me endpoint, role checks and current database role', async () => {
      assert.equal((await send('GET', '/api/users/me')).status, 401);
      const result = await send('GET', '/api/users/me', undefined, token);
      assert.equal(result.status, 200);
      assert.equal(result.body.user.uid, uid);
      assert.ok(!('password' in result.body.user));
      assert.equal((await send('GET', '/__test/admin', undefined, token)).status, 403);
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { rolename: 'ADMIN' } });
      const customerRole = await prisma.role.findUniqueOrThrow({ where: { rolename: 'normal' } });
      await prisma.user.update({ where: { uid }, data: { roleid: adminRole.roleid } });
      assert.equal((await send('GET', '/__test/admin', undefined, token)).status, 200);
      await prisma.user.update({ where: { uid }, data: { roleid: customerRole.roleid } });
      assert.equal((await send('GET', '/__test/admin', undefined, token)).status, 403);
    });
    await t.test('expired, invalid signature, algorithm, issuer, audience and missing expiry', async () => {
      const options = { algorithm: 'HS256', subject: String(uid), expiresIn: 900, issuer: config.jwtIssuer, audience: config.jwtAudience };
      const invalidTokens = [
        'not-a-token',
        jwt.sign({}, config.jwtSecret, { ...options, expiresIn: -1 }),
        jwt.sign({}, 'a-different-secret-at-least-32-bytes', options),
        jwt.sign({}, config.jwtSecret, { ...options, algorithm: 'HS384' }),
        jwt.sign({}, config.jwtSecret, { ...options, issuer: 'other-api' }),
        jwt.sign({}, config.jwtSecret, { ...options, audience: 'other-client' }),
        jwt.sign({}, config.jwtSecret, { algorithm: 'HS256', subject: String(uid), issuer: config.jwtIssuer, audience: config.jwtAudience }),
      ];
      for (const invalid of invalidTokens) assert.equal((await send('GET', '/api/users/me', undefined, invalid)).status, 401);
    });
    await t.test('deleted account is rejected even with unexpired token', async () => {
      await prisma.user.delete({ where: { uid } });
      assert.equal((await send('GET', '/api/users/me', undefined, token)).status, 401);
    });
    await t.test('auth rate limit returns 429', async () => {
      let limited = false;
      for (let i = 0; i < 22; i++) {
        const result = await send('POST', '/api/auth/login', {});
        if (result.status === 429) { limited = true; break; }
        assert.equal(result.status, 400);
      }
      assert.ok(limited);
    });
    await t.test('existing liveness endpoint still works', async () => {
      assert.equal((await send('GET', '/health/live')).status, 200);
    });
  } finally {
    await prisma.user.deleteMany({ where: { username } });
    try { assert.equal(await prisma.user.count(), userCountBefore); }
    finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await prisma.$disconnect();
    }
  }
});
