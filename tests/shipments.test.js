import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';

test('Shipment permissions, lifecycle, order visibility and concurrent updates', { timeout: 60000 }, async t => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const marker = 'shipment_test_' + randomBytes(8).toString('hex');
  const usernames = [marker + '_a', marker + '_b'];
  const password = randomBytes(24).toString('hex');
  const before = {
    users: await prisma.user.count(), products: await prisma.product.count(), orders: await prisma.order.count(),
    details: await prisma.orderDetail.count(), shipments: await prisma.shipment.count(),
  };
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
  const tokens = [];
  let adminToken, oid, product, firstShipid, secondShipid;
  try {
    for (const username of usernames) {
      assert.equal((await send('POST', '/api/auth/register', { username, password, fullname: 'Temporary shipment verification' })).status, 201);
      const login = await send('POST', '/api/auth/login', { username, password });
      assert.equal(login.status, 200);
      tokens.push(login.body.accessToken);
    }
    const admin = await send('POST', '/api/auth/login', { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    assert.equal(admin.status, 200);
    adminToken = admin.body.accessToken;
    product = await prisma.product.create({ data: { pname: marker + '_product', price: '10.00', quantity: 3 } });
    const order = await send('POST', '/api/orders', { items: [{ pid: product.pid, qty: 1 }] }, tokens[0]);
    assert.equal(order.status, 201);
    oid = order.body.order.oid;
    const createPath = '/api/orders/' + oid + '/shipments';

    await t.test('only admin may create shipments', async () => {
      assert.equal((await send('POST', createPath, {})).status, 401);
      assert.equal((await send('POST', createPath, {}, tokens[0])).status, 403);
      assert.equal((await send('POST', createPath, {}, tokens[1])).status, 403);
      assert.equal(await prisma.shipment.count({ where: { oid } }), 0);
    });
    await t.test('creation input validation and absent order', async () => {
      for (const body of [null, [], { status: 'SHIPPED' }, { status: 'unknown' }, { oid }, { status: 'PENDING', shipid: 1 }]) {
        assert.equal((await send('POST', createPath, body, adminToken)).status, 400);
      }
      assert.equal((await send('POST', '/api/orders/abc/shipments', {}, adminToken)).status, 400);
      assert.equal((await send('POST', '/api/orders/2147483647/shipments', {}, adminToken)).status, 404);
      assert.equal(await prisma.shipment.count({ where: { oid } }), 0);
    });
    await t.test('multiple shipments per order start PENDING and are visible to owner', async () => {
      const first = await send('POST', createPath, {}, adminToken);
      const second = await send('POST', createPath, { status: 'PENDING' }, adminToken);
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      firstShipid = first.body.shipment.shipid;
      secondShipid = second.body.shipment.shipid;
      assert.notEqual(firstShipid, secondShipid);
      assert.equal(first.body.shipment.status, 'PENDING');
      assert.equal(first.body.shipment.oid, oid);
      const detail = await send('GET', '/api/orders/' + oid, undefined, tokens[0]);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.order.shipments.length, 2);
      assert.equal((await send('GET', '/api/orders/' + oid, undefined, tokens[1])).status, 404);
    });
    await t.test('update permissions, invalid IDs/status and protected fields', async () => {
      const path = '/api/shipments/' + firstShipid;
      assert.equal((await send('PATCH', path, { status: 'SHIPPED' })).status, 401);
      assert.equal((await send('PATCH', path, { status: 'SHIPPED' }, tokens[0])).status, 403);
      for (const body of [{}, { status: 'shipped' }, { status: 'UNKNOWN' }, { status: null }, { status: 'SHIPPED', oid: 2 }]) {
        assert.equal((await send('PATCH', path, body, adminToken)).status, 400);
      }
      assert.equal((await send('PATCH', '/api/shipments/0', { status: 'SHIPPED' }, adminToken)).status, 400);
      assert.equal((await send('PATCH', '/api/shipments/2147483647', { status: 'SHIPPED' }, adminToken)).status, 404);
      assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { shipid: firstShipid } })).status, 'PENDING');
    });
    await t.test('delivery lifecycle, skipped/backwards transitions and idempotent repeat', async () => {
      const path = '/api/shipments/' + firstShipid;
      assert.equal((await send('PATCH', path, { status: 'DELIVERED' }, adminToken)).status, 409);
      assert.equal((await send('PATCH', path, { status: 'FAILED' }, adminToken)).status, 409);
      const shipped = await send('PATCH', path, { status: 'SHIPPED' }, adminToken);
      assert.equal(shipped.status, 200);
      assert.equal(shipped.body.shipment.status, 'SHIPPED');
      assert.equal((await send('PATCH', path, { status: 'PENDING' }, adminToken)).status, 409);
      const delivered = await send('PATCH', path, { status: 'DELIVERED' }, adminToken);
      assert.equal(delivered.status, 200);
      assert.equal(delivered.body.shipment.status, 'DELIVERED');
      const repeat = await send('PATCH', path, { status: 'DELIVERED' }, adminToken);
      assert.equal(repeat.status, 200);
      assert.deepEqual(repeat.body.shipment, delivered.body.shipment);
      assert.equal((await send('PATCH', path, { status: 'SHIPPED' }, adminToken)).status, 409);
      assert.equal((await send('PATCH', path, { status: 'FAILED' }, adminToken)).status, 409);
    });
    await t.test('failure lifecycle preserves order and inventory', async () => {
      const path = '/api/shipments/' + secondShipid;
      assert.equal((await send('PATCH', path, { status: 'SHIPPED' }, adminToken)).status, 200);
      const failed = await send('PATCH', path, { status: 'FAILED' }, adminToken);
      assert.equal(failed.status, 200);
      assert.equal(failed.body.shipment.status, 'FAILED');
      assert.equal((await send('PATCH', path, { status: 'SHIPPED' }, adminToken)).status, 409);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { pid: product.pid } })).quantity, 2);
      assert.equal(await prisma.order.count({ where: { oid } }), 1);
      const detail = await send('GET', '/api/orders/' + oid, undefined, tokens[0]);
      assert.deepEqual(detail.body.order.shipments.map(ship => ship.status), ['DELIVERED', 'FAILED']);
      assert.equal(detail.body.order.total, '10.00');
    });
    await t.test('conflicting concurrent terminal updates do not overwrite each other', async () => {
      for (let round = 0; round < 3; round++) {
        const created = await send('POST', createPath, {}, adminToken);
        assert.equal(created.status, 201);
        const path = '/api/shipments/' + created.body.shipment.shipid;
        assert.equal((await send('PATCH', path, { status: 'SHIPPED' }, adminToken)).status, 200);
        const results = await Promise.all([
          send('PATCH', path, { status: 'DELIVERED' }, adminToken),
          send('PATCH', path, { status: 'FAILED' }, adminToken),
        ]);
        assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
        const winner = results.find(result => result.status === 200).body.shipment;
        assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { shipid: winner.shipid } })).status, winner.status);
      }
    });
  } finally {
    const testUsers = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { uid: true } });
    const ids = testUsers.map(user => user.uid);
    await prisma.$transaction(async tx => {
      await tx.shipment.deleteMany({ where: { order: { uid: { in: ids } } } });
      await tx.orderDetail.deleteMany({ where: { order: { uid: { in: ids } } } });
      await tx.order.deleteMany({ where: { uid: { in: ids } } });
      await tx.product.deleteMany({ where: { pname: marker + '_product' } });
      await tx.user.deleteMany({ where: { username: { in: usernames } } });
    });
    try {
      assert.equal(await prisma.user.count(), before.users);
      assert.equal(await prisma.product.count(), before.products);
      assert.equal(await prisma.order.count(), before.orders);
      assert.equal(await prisma.orderDetail.count(), before.details);
      assert.equal(await prisma.shipment.count(), before.shipments);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await prisma.$disconnect();
    }
  }
});
