import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';

test('Product APIs with real HTTP and PostgreSQL', { timeout: 60000 }, async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const marker = 'product_test_' + randomBytes(8).toString('hex');
  const username = marker;
  const password = randomBytes(24).toString('hex');
  const beforeProducts = await prisma.product.count();
  const beforeUsers = await prisma.user.count();
  const send = (method, path, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
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
  let adminToken, customerToken, pid;
  const input = { pname: marker + '_a', price: '19.99', quantity: 5 };
  try {
    const admin = await send('POST', '/api/auth/login', { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    assert.equal(admin.status, 200);
    adminToken = admin.body.accessToken;
    assert.equal((await send('POST', '/api/auth/register', { username, password, fullname: 'Temporary product verification' })).status, 201);
    const customer = await send('POST', '/api/auth/login', { username, password });
    assert.equal(customer.status, 200);
    customerToken = customer.body.accessToken;

    await t.test('public list, pagination metadata and empty page', async () => {
      const result = await send('GET', '/api/products');
      assert.equal(result.status, 200);
      assert.equal(result.body.pagination.page, 1);
      assert.equal(result.body.pagination.limit, 20);
      assert.equal(result.body.pagination.total, beforeProducts);
      assert.ok(Array.isArray(result.body.data));
      const empty = await send('GET', '/api/products?page=100000&limit=100');
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.body.data, []);
    });
    await t.test('unauthenticated and customer writes are blocked', async () => {
      assert.equal((await send('POST', '/api/products', input)).status, 401);
      assert.equal((await send('POST', '/api/products', input, customerToken)).status, 403);
      assert.equal(await prisma.product.count(), beforeProducts);
    });
    await t.test('admin creates product; exact price and Location header', async () => {
      const result = await send('POST', '/api/products', input, adminToken);
      assert.equal(result.status, 201);
      pid = result.body.product.pid;
      assert.equal(result.headers.location, '/api/products/' + pid);
      assert.equal(result.body.product.price, '19.99');
      assert.equal(result.body.product.quantity, 5);
      const stored = await prisma.product.findUniqueOrThrow({ where: { pid } });
      assert.equal(stored.price.toFixed(2), '19.99');
      const detail = await send('GET', '/api/products/' + pid);
      assert.equal(detail.status, 200);
      assert.deepEqual(detail.body.product, result.body.product);
    });
    await t.test('invalid IDs and pagination return 400; absent product returns 404', async () => {
      for (const value of ['abc','0','-1','1.5','2147483648']) assert.equal((await send('GET', '/api/products/' + value)).status, 400);
      for (const query of ['page=0','limit=101','page=1.5','page=100001','limit=abc','limit=1&limit=2','unexpected=true']) assert.equal((await send('GET', '/api/products?' + query)).status, 400);
      assert.equal(await prisma.product.count({ where: { pid: 2147483647 } }), 0);
      assert.equal((await send('GET', '/api/products/2147483647')).status, 404);
    });
    await t.test('invalid product values never reach database', async () => {
      const variants = [
        { ...input, pname: ' ' }, { ...input, pname: 'a'.repeat(101) },
        { ...input, price: '-1.00' }, { ...input, price: '1.001' },
        { ...input, price: '100000000.00' }, { ...input, price: '1e3' },
        { ...input, price: 19.99 }, { ...input, price: null },
        { ...input, quantity: -1 }, { ...input, quantity: 1.5 },
        { ...input, quantity: '5' }, { ...input, quantity: 2147483648 },
        { ...input, pid: 100 }, {}, [], null,
      ];
      const count = await prisma.product.count();
      for (const value of variants) assert.equal((await send('POST', '/api/products', value, adminToken)).status, 400);
      assert.equal(await prisma.product.count(), count);
    });
    await t.test('PATCH permissions, partial update and field preservation', async () => {
      const path = '/api/products/' + pid;
      assert.equal((await send('PATCH', path, { price: '25.50' })).status, 401);
      assert.equal((await send('PATCH', path, { price: '25.50' }, customerToken)).status, 403);
      const updated = await send('PATCH', path, { price: '25.50' }, adminToken);
      assert.equal(updated.status, 200);
      assert.equal(updated.body.product.price, '25.50');
      assert.equal(updated.body.product.pname, input.pname);
      assert.equal(updated.body.product.quantity, 5);
      for (const value of [{}, { pid: 2 }, { price: '1.001' }, { quantity: -1 }]) assert.equal((await send('PATCH', path, value, adminToken)).status, 400);
      assert.equal((await send('PATCH', '/api/products/abc', { quantity: 0 }, adminToken)).status, 400);
      assert.equal((await send('PATCH', '/api/products/2147483647', { quantity: 0 }, adminToken)).status, 404);
      assert.equal((await send('PATCH', path, { quantity: 0, price: '0' }, adminToken)).body.product.price, '0.00');
    });
    await t.test('decimal upper boundary and deterministic pagination', async () => {
      const result = await send('POST', '/api/products', { pname: marker + '_b', price: '99999999.99', quantity: 0 }, adminToken);
      assert.equal(result.status, 201);
      assert.equal(result.body.product.price, '99999999.99');
      const first = await send('GET', '/api/products?page=1&limit=1');
      const second = await send('GET', '/api/products?page=2&limit=1');
      const expected = await prisma.product.findMany({ orderBy: { pid: 'asc' }, take: 2 });
      assert.equal(first.body.data[0].pid, expected[0].pid);
      assert.equal(second.body.data[0].pid, expected[1].pid);
      assert.equal(first.body.pagination.total, beforeProducts + 2);
      assert.equal(first.body.pagination.totalPages, beforeProducts + 2);
    });
  } finally {
    await prisma.product.deleteMany({ where: { pname: { startsWith: marker + '_' } } });
    await prisma.user.deleteMany({ where: { username } });
    try {
      assert.equal(await prisma.product.count(), beforeProducts);
      assert.equal(await prisma.user.count(), beforeUsers);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await prisma.$disconnect();
    }
  }
});
