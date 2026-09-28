// Product catalog, pricing and validation shared by the browser and the server.
// The server always re-runs `validateConfig` + `priceConfig` so a customer can
// never change what they pay by editing the page.

export const LIMITS = {
  width: { min: 100, max: 800, step: 10 }, // mm
  height: { min: 100, max: 1000, step: 10 },
  depth: { min: 50, max: 400, step: 10 },
  quantity: { min: 1, max: 500 },
  knockouts: { min: 0, max: 12 },
  accessories: 16,
  edgeMargin: 8, // mm kept clear between an accessory and a panel edge
};

export const MATERIALS = {
  steel: { label: 'Cold-rolled steel 16ga', ratePerM2: 85, thickness: 1.5 },
  galvanized: { label: 'Galvanized steel 16ga', ratePerM2: 105, thickness: 1.5 },
  aluminum: { label: 'Aluminum 5052 2mm', ratePerM2: 140, thickness: 2 },
  stainless: { label: 'Stainless steel 304', ratePerM2: 190, thickness: 1.5 },
};

export const STYLES = {
  hinged: { label: 'Hinged door', price: 25, description: 'Full front door on a side hinge' },
  louvered: { label: 'Louvered cover', price: 18, description: 'Front cover with ventilation louvers' },
  screw: { label: 'Screw cover', price: 0, description: 'Flat front cover fixed with 4 screws' },
};

export const COLORS = {
  beige: { label: 'Almond beige', hex: '#e6dccb', price: 0 },
  white: { label: 'Signal white', hex: '#f2f2ee', price: 0 },
  gray: { label: 'Light gray', hex: '#b9bcbf', price: 0 },
  black: { label: 'Textured black', hex: '#2b2b2d', price: 8 },
  bare: { label: 'Bare metal (no paint)', hex: '#a7abb0', price: -10 },
};

export const OPTIONS = {
  lock: { label: 'Key lock', price: 15, styles: ['hinged'] },
  mountingPlate: { label: 'Internal mounting plate', price: 12, perM2: 60 },
  wallTabs: { label: 'Wall-mount tabs', price: 6 },
  gasket: { label: 'Weather gasket (IP54)', price: 14 },
};

export const KNOCKOUT_PRICE = 2;

// Accessories the customer can drop onto any panel of the 3D model.
// w/h are the footprint on the panel in mm.
export const ACCESSORIES = {
  fan80: { label: 'Fan 80 mm', kind: 'fan', w: 80, h: 80, price: 22, install: 6, through: true },
  fan120: { label: 'Fan 120 mm', kind: 'fan', w: 120, h: 120, price: 29, install: 6, through: true },
  ledStrip: { label: 'LED strip 200 mm', kind: 'strip', w: 200, h: 12, price: 14, install: 5, rotatable: true },
  ledIndicator: { label: 'LED indicator light', kind: 'indicator', w: 16, h: 16, price: 4, install: 3 },
};

export const LED_COLORS = {
  white: '#fff6e0',
  red: '#ff3b30',
  green: '#34c759',
  blue: '#2f7bff',
  amber: '#ffb020',
};

export const FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export const QUANTITY_DISCOUNTS = [
  { min: 25, rate: 0.15 },
  { min: 10, rate: 0.1 },
  { min: 5, rate: 0.05 },
];

export const SHIPPING_FLAT = 15;

export const DEFAULT_CONFIG = Object.freeze({
  width: 300,
  height: 400,
  depth: 150,
  material: 'steel',
  style: 'hinged',
  color: 'beige',
  options: { lock: false, mountingPlate: true, wallTabs: false, gasket: false },
  knockouts: 4,
  quantity: 1,
  accessories: [],
});

export function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/** Width/height in mm of a face as seen from outside (u runs along w, v along h). */
export function faceSize(config, face) {
  const { width: W, height: H, depth: D } = config;
  switch (face) {
    case 'front':
    case 'back':
      return { w: W, h: H };
    case 'left':
    case 'right':
      return { w: D, h: H };
    case 'top':
    case 'bottom':
      return { w: W, h: D };
    default:
      return null;
  }
}

/** Footprint of an accessory taking its rotation into account. */
export function footprint(acc) {
  const def = ACCESSORIES[acc.type];
  const rotated = def.rotatable && acc.rotation === 90;
  return rotated ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

/**
 * Clamp normalized face coordinates (u, v in [-0.5, 0.5]) so the accessory
 * stays fully on the panel. Returns null if it cannot fit on that face at all.
 */
export function clampToFace(config, acc) {
  const size = faceSize(config, acc.face);
  if (!size) return null;
  const fp = footprint(acc);
  const maxU = (size.w / 2 - fp.w / 2 - LIMITS.edgeMargin) / size.w;
  const maxV = (size.h / 2 - fp.h / 2 - LIMITS.edgeMargin) / size.h;
  if (maxU < 0 || maxV < 0) return null;
  const clamp = (x, m) => Math.min(m, Math.max(-m, x));
  return { u: clamp(acc.u, maxU), v: clamp(acc.v, maxV) };
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Validate and normalize a configuration. Returns { ok, config, errors }.
 * The normalized config only contains known keys.
 */
export function validateConfig(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Configuration is missing'] };
  }
  const config = { options: {}, accessories: [] };

  for (const dim of ['width', 'height', 'depth']) {
    const { min, max } = LIMITS[dim];
    const val = input[dim];
    if (!isNum(val) || val < min || val > max) {
      errors.push(`${dim} must be between ${min} and ${max} mm`);
    }
    config[dim] = Math.round(val);
  }

  if (!MATERIALS[input.material]) errors.push('Unknown material');
  config.material = input.material;
  if (!STYLES[input.style]) errors.push('Unknown style');
  config.style = input.style;
  if (!COLORS[input.color]) errors.push('Unknown color');
  config.color = input.color;

  for (const [key, def] of Object.entries(OPTIONS)) {
    const on = Boolean(input.options && input.options[key]);
    config.options[key] = on && (!def.styles || def.styles.includes(config.style));
  }

  const ko = input.knockouts;
  if (!Number.isInteger(ko) || ko < LIMITS.knockouts.min || ko > LIMITS.knockouts.max) {
    errors.push(`Knockouts must be between ${LIMITS.knockouts.min} and ${LIMITS.knockouts.max}`);
  }
  config.knockouts = ko;

  const qty = input.quantity;
  if (!Number.isInteger(qty) || qty < LIMITS.quantity.min || qty > LIMITS.quantity.max) {
    errors.push(`Quantity must be between ${LIMITS.quantity.min} and ${LIMITS.quantity.max}`);
  }
  config.quantity = qty;

  const accs = Array.isArray(input.accessories) ? input.accessories : [];
  if (accs.length > LIMITS.accessories) {
    errors.push(`At most ${LIMITS.accessories} accessories per box`);
  }
  accs.slice(0, LIMITS.accessories).forEach((a, i) => {
    const n = i + 1;
    if (!a || !ACCESSORIES[a.type]) return errors.push(`Accessory ${n}: unknown type`);
    if (!FACES.includes(a.face)) return errors.push(`Accessory ${n}: unknown panel`);
    if (!isNum(a.u) || !isNum(a.v)) return errors.push(`Accessory ${n}: invalid position`);
    const def = ACCESSORIES[a.type];
    const acc = {
      id: String(a.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || `a${n}`,
      type: a.type,
      face: a.face,
      u: a.u,
      v: a.v,
      rotation: def.rotatable && a.rotation === 90 ? 90 : 0,
      side: def.through ? 'through' : a.side === 'inside' ? 'inside' : 'outside',
    };
    if (def.kind !== 'fan') acc.color = LED_COLORS[a.color] ? a.color : 'white';
    const fit = clampToFace(config, acc);
    if (!fit) return errors.push(`Accessory ${n}: ${def.label} does not fit on the ${a.face} panel`);
    const tolerance = 1e-6;
    if (Math.abs(fit.u - acc.u) > tolerance || Math.abs(fit.v - acc.v) > tolerance) {
      return errors.push(`Accessory ${n}: ${def.label} hangs over the edge of the ${a.face} panel`);
    }
    config.accessories.push(acc);
  });

  return { ok: errors.length === 0, config, errors };
}

const round2 = (x) => Math.round(x * 100) / 100;

/** Price breakdown for a (validated) configuration. All amounts in USD. */
export function priceConfig(config) {
  const { width: W, height: H, depth: D } = config;
  const areaM2 = (2 * (W * H + W * D + H * D)) / 1e6;
  const lines = [];
  const add = (label, amount) => lines.push({ label, amount: round2(amount) });

  add('Fabrication', 35);
  add(`${MATERIALS[config.material].label} (${areaM2.toFixed(2)} m²)`, areaM2 * MATERIALS[config.material].ratePerM2);
  if (STYLES[config.style].price) add(STYLES[config.style].label, STYLES[config.style].price);
  if (COLORS[config.color].price) add(`Finish: ${COLORS[config.color].label}`, COLORS[config.color].price);

  for (const [key, def] of Object.entries(OPTIONS)) {
    if (!config.options[key]) continue;
    const extra = def.perM2 ? ((W * H) / 1e6) * def.perM2 : 0;
    add(def.label, def.price + extra);
  }
  if (config.knockouts) add(`Knockouts ×${config.knockouts}`, config.knockouts * KNOCKOUT_PRICE);

  const counts = {};
  for (const a of config.accessories) counts[a.type] = (counts[a.type] || 0) + 1;
  for (const [type, count] of Object.entries(counts)) {
    const def = ACCESSORIES[type];
    add(`${def.label} ×${count} (installed)`, count * (def.price + def.install));
  }

  const unit = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tier = QUANTITY_DISCOUNTS.find((t) => config.quantity >= t.min);
  const discountRate = tier ? tier.rate : 0;
  const unitAfterDiscount = round2(unit * (1 - discountRate));
  const subtotal = round2(unitAfterDiscount * config.quantity);
  const shipping = SHIPPING_FLAT;
  return {
    lines,
    unit,
    discountRate,
    unitAfterDiscount,
    quantity: config.quantity,
    subtotal,
    shipping,
    total: round2(subtotal + shipping),
    currency: 'usd',
  };
}

/** Short human-readable description, used for the Stripe line item and order list. */
export function describeConfig(config) {
  const accs = config.accessories.length ? `, ${config.accessories.length} accessories` : '';
  return `${config.width}×${config.height}×${config.depth} mm ${STYLES[config.style].label.toLowerCase()}, ${
    MATERIALS[config.material].label
  }, ${COLORS[config.color].label}${accs}`;
}
