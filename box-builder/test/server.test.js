import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { cloneDefault } from '../shared/catalog.js';

let server, base, dir;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'boxes-'));
  const app = createApp({ stripeKey: '', adminToken: 'secret', ordersFile: path.join(dir, 'orders.json') });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const post = (url, body) => fetch(base + url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('checkout in demo mode records the order with a server-computed price', async () => {
  const config = cloneDefault();
  config.accessories = [{ id: 'f1', type: 'fan80', face: 'right', u: 0, v: 0 }];
  const res = await post('/api/checkout', { config, notes: 'hi', price: { total: 0.01 } });
  assert.equal(res.status, 200);
  const { url } = await res.json();
  const id = new URL(url, base).searchParams.get('order');
  const order = await (await fetch(`${base}/api/orders/${id}`)).json();
  assert.equal(order.status, 'demo');
  assert.ok(order.price.total > 100);

  const unauth = await fetch(`${base}/api/admin/orders`);
  assert.equal(unauth.status, 401);
  const list = await (await fetch(`${base}/api/admin/orders`, { headers: { Authorization: 'Bearer secret' } })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].notes, 'hi');
});

test('checkout rejects invalid designs', async () => {
  const res = await post('/api/checkout', { config: { ...cloneDefault(), height: 5 } });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).errors.length);
});

test('serves the configurator and three.js', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/vendor/three/build/three.module.js`)).status, 200);
  assert.equal((await fetch(`${base}/shared/catalog.js`)).status, 200);
});
