import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';

test('Orders, ownership, price snapshot, atomic stock and concurrent purchases', { timeout: 60000 }, async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const marker = 'order_test_' + randomBytes(8).toString('hex');
  const usernames = [marker + '_a', marker + '_b'];
  const password = randomBytes(24).toString('hex');
  const before = { users: await prisma.user.count(), products: await prisma.product.count(), orders: await prisma.order.count(), details: await prisma.orderDetail.count() };
  const send = (method, path, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const headers = {};
    if (data !== undefined) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => text += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }); } catch (err) { reject(err); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('HTTP timeout')));
    req.end(data);
  });
  const userIds = [];
  const tokens = [];
  let oid, adminToken;
  let p1, p2, empty;
  try {
    for (const username of usernames) {
      const register = await send('POST', '/api/auth/register', { username, fullname: 'Temporary order verification', password });
      assert.equal(register.status, 201);
      userIds.push(register.body.user.uid);
      const login = await send('POST', '/api/auth/login', { username, password });
      assert.equal(login.status, 200);
      tokens.push(login.body.accessToken);
    }
    const admin = await send('POST', '/api/auth/login', { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    assert.equal(admin.status, 200);
    adminToken = admin.body.accessToken;
    p1 = await prisma.product.create({ data: { pname: marker + '_p1', price: '19.99', quantity: 5 } });
    p2 = await prisma.product.create({ data: { pname: marker + '_p2', price: '0.10', quantity: 10 } });
    empty = await prisma.product.create({ data: { pname: marker + '_empty', price: '1.00', quantity: 0 } });

    await t.test('authentication and normal-only ordering', async () => {
      const body = { items: [{ pid: p1.pid, qty: 1 }] };
      assert.equal((await send('POST', '/api/orders', body)).status, 401);
      assert.equal((await send('POST', '/api/orders', body, adminToken)).status, 403);
      assert.equal((await send('GET', '/api/orders')).status, 401);
    });
    await t.test('reject forged user/price, duplicates and invalid quantities', async () => {
      const variants = [
        {}, null, [], { items: [] },
        { uid: userIds[1], items: [{ pid: p1.pid, qty: 1 }] },
        { items: [{ pid: p1.pid, qty: 1, unit_price: '0.01' }] },
        { items: [{ pid: p1.pid, qty: 1 }, { pid: p1.pid, qty: 2 }] },
        { items: [{ pid: p1.pid, qty: 0 }] }, { items: [{ pid: p1.pid, qty: -1 }] },
        { items: [{ pid: p1.pid, qty: 1.5 }] }, { items: [{ pid: p1.pid, qty: 1000001 }] },
        { items: [{ pid: String(p1.pid), qty: 1 }] },
        { items: Array.from({ length: 51 }, (_, i) => ({ pid: i + 1, qty: 1 })) },
      ];
      for (const body of variants) assert.equal((await send('POST', '/api/orders', body, tokens[0])).status, 400);
      assert.equal(await prisma.order.count(), before.orders);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: p1.pid } })).quantity, 5);
    });
    await t.test('create order, accurate total, price from DB and stock decrement', async () => {
      const result = await send('POST', '/api/orders', { items: [{ pid: p2.pid, qty: 3 }, { pid: p1.pid, qty: 2 }] }, tokens[0]);
      assert.equal(result.status, 201);
      oid = result.body.order.oid;
      assert.equal(result.headers.location, '/api/orders/' + oid);
      assert.equal(result.body.order.uid, userIds[0]);
      assert.equal(result.body.order.total, '40.28');
      assert.equal(result.body.order.items.length, 2);
      assert.equal(result.body.order.items.find(item => item.pid === p1.pid).unit_price, '19.99');
      assert.deepEqual(result.body.order.shipments, []);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: p1.pid } })).quantity, 3);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: p2.pid } })).quantity, 7);
      assert.equal(await prisma.orderDetail.count({ where: { oid } }), 2);
    });
    await t.test('historical price is unchanged after product price update', async () => {
      assert.equal((await send('PATCH', '/api/products/' + p1.pid, { price: '49.99' }, adminToken)).status, 200);
      const result = await send('GET', '/api/orders/' + oid, undefined, tokens[0]);
      assert.equal(result.status, 200);
      assert.equal(result.body.order.items.find(item => item.pid === p1.pid).unit_price, '19.99');
      assert.equal(result.body.order.total, '40.28');
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.ok(!JSON.stringify(result.body).includes('password'));
    });
    await t.test('owner access, other customer isolation and admin access', async () => {
      assert.equal((await send('GET', '/api/orders/' + oid, undefined, tokens[1])).status, 404);
      assert.equal((await send('GET', '/api/orders/' + oid, undefined, adminToken)).status, 200);
      const own = await send('GET', '/api/orders', undefined, tokens[0]);
      assert.equal(own.body.pagination.total, 1);
      assert.equal(own.body.data[0].oid, oid);
      const other = await send('GET', '/api/orders', undefined, tokens[1]);
      assert.equal(other.body.pagination.total, 0);
      assert.deepEqual(other.body.data, []);
      const all = await send('GET', '/api/orders', undefined, adminToken);
      assert.equal(all.body.pagination.total, before.orders + 1);
      for (const query of ['page=0', 'limit=101', 'uid=1']) assert.equal((await send('GET', '/api/orders?' + query, undefined, tokens[0])).status, 400);
      assert.equal((await send('GET', '/api/orders/abc', undefined, tokens[0])).status, 400);
      assert.equal((await send('GET', '/api/orders/2147483647', undefined, tokens[0])).status, 404);
    });
    await t.test('insufficient later item rolls back earlier stock update', async () => {
      const orderCount = await prisma.order.count();
      const detailCount = await prisma.orderDetail.count();
      const stock = (await prisma.product.findUniqueOrThrow({ where: { pid: p1.pid } })).quantity;
      const result = await send('POST', '/api/orders', { items: [{ pid: p1.pid, qty: 1 }, { pid: empty.pid, qty: 1 }] }, tokens[0]);
      assert.equal(result.status, 409);
      assert.equal(await prisma.order.count(), orderCount);
      assert.equal(await prisma.orderDetail.count(), detailCount);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: p1.pid } })).quantity, stock);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: empty.pid } })).quantity, 0);
      const missing = await send('POST', '/api/orders', { items: [{ pid: p1.pid, qty: 1 }, { pid: 2147483647, qty: 1 }] }, tokens[0]);
      assert.equal(missing.status, 404);
      assert.equal(await prisma.order.count(), orderCount);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: p1.pid } })).quantity, stock);
    });
    await t.test('two simultaneous purchases of last unit: one success, one conflict', async () => {
      for (let round = 0; round < 3; round++) {
        const rare = await prisma.product.create({ data: { pname: marker + '_race_' + round, price: '1.25', quantity: 1 } });
        const orderCount = await prisma.order.count();
        const results = await Promise.all(tokens.map(token => send('POST', '/api/orders', { items: [{ pid: rare.pid, qty: 1 }] }, token)));
        assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
        assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: rare.pid } })).quantity, 0);
        assert.equal(await prisma.order.count(), orderCount + 1);
        assert.equal(await prisma.orderDetail.count({ where: { pid: rare.pid } }), 1);
      }
    });
    await t.test('opposite item order in concurrent baskets is atomic', async () => {
      const a = await prisma.product.create({ data: { pname: marker + '_multi_a', price: '2.00', quantity: 1 } });
      const b = await prisma.product.create({ data: { pname: marker + '_multi_b', price: '3.00', quantity: 1 } });
      const orderCount = await prisma.order.count();
      const results = await Promise.all([
        send('POST', '/api/orders', { items: [{ pid: a.pid, qty: 1 }, { pid: b.pid, qty: 1 }] }, tokens[0]),
        send('POST', '/api/orders', { items: [{ pid: b.pid, qty: 1 }, { pid: a.pid, qty: 1 }] }, tokens[1]),
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      assert.equal(results.find(result => result.status === 201).body.order.total, '5.00');
      assert.equal(await prisma.order.count(), orderCount + 1);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: a.pid } })).quantity, 0);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: b.pid } })).quantity, 0);
    });
  } finally {
    // Delete only records owned by this test's random usernames and products.
    const testUsers = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { uid: true } });
    const ids = testUsers.map(user => user.uid);
    await prisma.$transaction(async tx => {
      await tx.shipment.deleteMany({ where: { order: { uid: { in: ids } } } });
      await tx.orderDetail.deleteMany({ where: { order: { uid: { in: ids } } } });
      await tx.order.deleteMany({ where: { uid: { in: ids } } });
      await tx.product.deleteMany({ where: { pname: { startsWith: marker + '_' } } });
      await tx.user.deleteMany({ where: { username: { in: usernames } } });
    });
    try {
      assert.equal(await prisma.user.count(), before.users);
      assert.equal(await prisma.product.count(), before.products);
      assert.equal(await prisma.order.count(), before.orders);
      assert.equal(await prisma.orderDetail.count(), before.details);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await prisma.$disconnect();
    }
  }
});
