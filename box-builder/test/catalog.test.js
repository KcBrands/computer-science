import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneDefault, validateConfig, priceConfig, clampToFace } from '../shared/catalog.js';

test('default config is valid and priced', () => {
  const { ok, config } = validateConfig(cloneDefault());
  assert.ok(ok);
  const p = priceConfig(config);
  assert.ok(p.unit > 0);
  assert.equal(p.total, p.subtotal + p.shipping);
});

test('rejects out-of-range dimensions', () => {
  const c = { ...cloneDefault(), width: 5000 };
  assert.equal(validateConfig(c).ok, false);
});

test('rejects accessory hanging over a panel edge', () => {
  const c = cloneDefault();
  c.accessories = [{ id: 'a', type: 'fan120', face: 'left', u: 0.4, v: 0 }];
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /does not fit|hangs over/);
});

test('clampToFace keeps accessory on the panel', () => {
  const c = cloneDefault();
  const fit = clampToFace(c, { type: 'fan80', face: 'front', u: 0.5, v: -0.5 });
  assert.ok(fit.u < 0.5 && fit.v > -0.5);
  const placed = { ...c, accessories: [{ id: 'a', type: 'fan80', face: 'front', ...fit }] };
  assert.ok(validateConfig(placed).ok);
});

test('accessories add to price and ids are sanitized', () => {
  const c = cloneDefault();
  const base = priceConfig(validateConfig(c).config).unit;
  c.accessories = [{ id: '"><img src=x>', type: 'ledStrip', face: 'back', u: 0, v: 0, color: 'blue', side: 'inside' }];
  const r = validateConfig(c);
  assert.ok(r.ok);
  assert.match(r.config.accessories[0].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(priceConfig(r.config).unit, base + 19);
});

test('lock option only applies to hinged style', () => {
  const c = { ...cloneDefault(), style: 'screw', options: { lock: true } };
  assert.equal(validateConfig(c).config.options.lock, false);
});

test('volume discount applies at 10 units', () => {
  const c = { ...cloneDefault(), quantity: 10 };
  const p = priceConfig(validateConfig(c).config);
  assert.equal(p.discountRate, 0.1);
});
