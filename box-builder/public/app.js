import {
  LIMITS, MATERIALS, STYLES, COLORS, OPTIONS, ACCESSORIES, LED_COLORS,
  cloneDefault, clampToFace, validateConfig, priceConfig,
} from '/shared/catalog.js';
import { createScene } from '/scene.js';

const $ = (id) => document.getElementById(id);
const money = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const FACE_LABELS = { front: 'Front', back: 'Back', left: 'Left side', right: 'Right side', top: 'Top', bottom: 'Bottom' };

const state = {
  config: loadFromHash() || loadLocal() || cloneDefault(),
  selectedId: null,
  placingType: null,
  doorOpen: false,
};

const scene = createScene($('scene'), {
  onPlace: placeAccessory,
  onMove: moveAccessory,
  onSelect: (id) => {
    state.selectedId = id;
    render();
  },
});

// ---------- persistence (design is kept in the URL so it can be shared) ----------

function loadFromHash() {
  const m = location.hash.match(/cfg=([^&]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
    const result = validateConfig(JSON.parse(json));
    return result.ok ? result.config : null;
  } catch {
    return null;
  }
}

function designUrl() {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state.config))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#cfg=${b64}`;
}

// Last design is also kept locally so it survives a cancelled payment.
function loadLocal() {
  try {
    const result = validateConfig(JSON.parse(localStorage.getItem('boxDesign')));
    return result.ok ? result.config : null;
  } catch {
    return null;
  }
}

let hashTimer;
function saveToHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, '', designUrl());
    try {
      localStorage.setItem('boxDesign', JSON.stringify(state.config));
    } catch {
      // storage unavailable (private mode); the URL still holds the design
    }
  }, 300);
}

// ---------- accessories ----------

const newId = () => Math.random().toString(36).slice(2, 9);

function placeAccessory(type, hit) {
  if (state.config.accessories.length >= LIMITS.accessories) {
    toast(`You can add up to ${LIMITS.accessories} accessories.`);
    return;
  }
  const def = ACCESSORIES[type];
  const acc = { id: newId(), type, face: hit.face, u: hit.u, v: hit.v, rotation: 0 };
  acc.side = def.through ? 'through' : hit.side;
  if (def.kind !== 'fan') acc.color = def.kind === 'indicator' ? 'green' : 'white';
  const fit = clampToFace(state.config, acc);
  if (!fit) {
    toast(`${def.label} doesn't fit on the ${FACE_LABELS[hit.face].toLowerCase()} panel.`);
    return;
  }
  Object.assign(acc, fit);
  state.config.accessories.push(acc);
  state.selectedId = acc.id;
  setPlacing(null);
  update();
}

function moveAccessory(id, hit) {
  const acc = findAcc(id);
  if (!acc) return;
  const def = ACCESSORIES[acc.type];
  const candidate = { ...acc, face: hit.face, u: hit.u, v: hit.v };
  if (!def.through) candidate.side = hit.side;
  const fit = clampToFace(state.config, candidate);
  if (!fit) return; // too big for that panel, stay where it was
  Object.assign(acc, candidate, fit);
  update();
}

const findAcc = (id) => state.config.accessories.find((a) => a.id === id);

function removeAccessory(id) {
  state.config.accessories = state.config.accessories.filter((a) => a.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  update();
}

function rotateAccessory(acc) {
  const next = { ...acc, rotation: acc.rotation === 90 ? 0 : 90 };
  const fit = clampToFace(state.config, next);
  if (!fit) return toast("It doesn't fit that way on this panel.");
  Object.assign(acc, next, fit);
  update();
}

// After a size change, pull accessories back onto their panels (or drop them).
function refitAccessories() {
  const dropped = [];
  state.config.accessories = state.config.accessories.filter((acc) => {
    const fit = clampToFace(state.config, acc);
    if (!fit) dropped.push(ACCESSORIES[acc.type].label);
    else Object.assign(acc, fit);
    return Boolean(fit);
  });
  if (dropped.length) toast(`Removed ${dropped.join(', ')} — no longer fits.`);
}

function setPlacing(type) {
  state.placingType = type;
  scene.setPlacing(type);
  $('placingBanner').hidden = !type;
  if (type) {
    $('placingText').textContent = `Click on the box to place the ${ACCESSORIES[type].label.toLowerCase()}`;
  }
  document.querySelectorAll('[data-add]').forEach((b) => b.classList.toggle('active', b.dataset.add === type));
}

// ---------- UI construction ----------

function buildControls() {
  for (const dim of ['width', 'height', 'depth']) {
    const input = $(dim);
    Object.assign(input, LIMITS[dim]);
    input.addEventListener('change', () => {
      const { min, max } = LIMITS[dim];
      const val = Math.round(Number(input.value));
      state.config[dim] = Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : state.config[dim];
      refitAccessories();
      update();
      scene.fit();
    });
  }

  $('styleCards').innerHTML = Object.entries(STYLES).map(([key, s]) => `
    <label class="card">
      <input type="radio" name="style" value="${key}">
      <span class="card-body">
        ${styleIcon(key)}
        <strong>${s.label}</strong>
        <span class="muted small">${s.description}</span>
        <span class="small">${s.price ? `+${money(s.price)}` : 'Included'}</span>
      </span>
    </label>`).join('');
  $('styleCards').addEventListener('change', (e) => {
    state.config.style = e.target.value;
    if (state.config.style !== 'hinged') state.doorOpen = false;
    update();
  });

  $('material').innerHTML = Object.entries(MATERIALS)
    .map(([key, m]) => `<option value="${key}">${m.label} — ${money(m.ratePerM2)}/m²</option>`).join('');
  $('material').addEventListener('change', (e) => {
    state.config.material = e.target.value;
    update();
  });

  $('colorSwatches').innerHTML = Object.entries(COLORS).map(([key, c]) => `
    <label class="swatch" title="${c.label}">
      <input type="radio" name="color" value="${key}" aria-label="${c.label}">
      <span style="--swatch:${c.hex}"></span>
    </label>`).join('');
  $('colorSwatches').addEventListener('change', (e) => {
    state.config.color = e.target.value;
    update();
  });

  $('optionList').innerHTML = Object.entries(OPTIONS).map(([key, o]) => `
    <label class="check">
      <input type="checkbox" value="${key}">
      <span>${o.label}${o.styles ? ` <span class="muted small">(${o.styles.map((s) => STYLES[s].label.toLowerCase()).join(', ')} only)</span>` : ''}</span>
      <span class="muted small">${o.perM2 ? 'from ' : ''}+${money(o.price)}</span>
    </label>`).join('');
  $('optionList').addEventListener('change', (e) => {
    state.config.options[e.target.value] = e.target.checked;
    update();
  });

  $('knockouts').addEventListener('change', (e) => {
    const n = Math.round(Number(e.target.value));
    state.config.knockouts = Math.min(LIMITS.knockouts.max, Math.max(0, Number.isFinite(n) ? n : 0));
    update();
  });

  $('quantity').addEventListener('change', (e) => {
    const n = Math.round(Number(e.target.value));
    state.config.quantity = Math.min(LIMITS.quantity.max, Math.max(1, Number.isFinite(n) ? n : 1));
    update();
  });

  $('addButtons').innerHTML = Object.entries(ACCESSORIES).map(([key, a]) => `
    <button type="button" class="add-btn" data-add="${key}">
      ${accessoryIcon(a.kind)}
      <span>${a.label}</span>
      <span class="muted small">${money(a.price + a.install)}</span>
    </button>`).join('');
  $('addButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (btn) setPlacing(state.placingType === btn.dataset.add ? null : btn.dataset.add);
  });
  $('cancelPlacingBtn').addEventListener('click', () => setPlacing(null));

  $('accList').addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const acc = findAcc(li.dataset.id);
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'remove') return removeAccessory(acc.id);
    if (action === 'rotate') return rotateAccessory(acc);
    if (action === 'side') {
      acc.side = acc.side === 'inside' ? 'outside' : 'inside';
      if (acc.side === 'inside' && acc.face === 'front' && state.config.style === 'hinged') state.doorOpen = true;
      return update();
    }
    if (e.target.tagName !== 'SELECT') {
      state.selectedId = acc.id;
      render();
    }
  });
  $('accList').addEventListener('change', (e) => {
    const li = e.target.closest('[data-id]');
    if (li && e.target.dataset.action === 'color') {
      findAcc(li.dataset.id).color = e.target.value;
      update();
    }
  });

  $('doorBtn').addEventListener('click', () => {
    state.doorOpen = !state.doorOpen;
    render();
  });
  $('resetViewBtn').addEventListener('click', () => scene.fit());

  $('shareBtn').addEventListener('click', async () => {
    const url = designUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — anyone with it can open this design.');
    } catch {
      prompt('Copy this link:', url);
    }
  });

  $('configForm').addEventListener('submit', checkout);

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape') setPlacing(null);
    const acc = state.selectedId && findAcc(state.selectedId);
    if (!acc) return;
    if (e.key === 'Delete' || e.key === 'Backspace') removeAccessory(acc.id);
    if (e.key.toLowerCase() === 'r' && ACCESSORIES[acc.type].rotatable) rotateAccessory(acc);
  });
}

function styleIcon(key) {
  const front = {
    hinged: '<rect x="8" y="6" width="26" height="34" rx="1"/><circle cx="29" cy="23" r="1.6"/><path d="M8 12v4M8 30v4"/>',
    louvered: '<rect x="8" y="6" width="26" height="34" rx="1"/><path d="M13 11h6M23 11h6M13 15h6M23 15h6M13 19h6M23 19h6"/>',
    screw: '<rect x="8" y="6" width="26" height="34" rx="1"/><circle cx="11.5" cy="9.5" r="1"/><circle cx="30.5" cy="9.5" r="1"/><circle cx="11.5" cy="36.5" r="1"/><circle cx="30.5" cy="36.5" r="1"/>',
  }[key];
  return `<svg viewBox="0 0 44 46" class="style-icon" aria-hidden="true"><path d="M34 6l6-3v34l-6 3" />${front}</svg>`;
}

function accessoryIcon(kind) {
  const body = {
    fan: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 2-5 4-4M14 12c3 0 5 2 4 4M12 14c0 3-2 5-4 4M10 12c-3 0-5-2-4-4"/>',
    strip: '<rect x="2" y="10" width="20" height="4" rx="1"/><path d="M6 7v-2M12 7v-3M18 7v-2"/>',
    indicator: '<circle cx="12" cy="13" r="5"/><path d="M12 4v2M5 7l1.5 1.5M19 7l-1.5 1.5"/>',
  }[kind];
  return `<svg viewBox="0 0 24 24" class="acc-icon" aria-hidden="true">${body}</svg>`;
}

// ---------- rendering ----------

function update() {
  saveToHash();
  render();
}

function render() {
  const { config } = state;
  for (const dim of ['width', 'height', 'depth']) {
    if (document.activeElement !== $(dim)) $(dim).value = config[dim];
  }
  document.querySelectorAll('input[name=style]').forEach((i) => { i.checked = i.value === config.style; });
  $('material').value = config.material;
  document.querySelectorAll('input[name=color]').forEach((i) => { i.checked = i.value === config.color; });
  $('colorLabel').textContent = COLORS[config.color].label
    + (COLORS[config.color].price ? ` (${COLORS[config.color].price > 0 ? '+' : '−'}${money(Math.abs(COLORS[config.color].price))})` : '');
  document.querySelectorAll('#optionList input').forEach((i) => {
    const def = OPTIONS[i.value];
    const allowed = !def.styles || def.styles.includes(config.style);
    i.disabled = !allowed;
    i.checked = allowed && Boolean(config.options[i.value]);
  });
  $('knockouts').value = config.knockouts;
  $('quantity').value = config.quantity;

  const hinged = config.style === 'hinged';
  $('doorBtn').hidden = !hinged;
  $('doorBtn').textContent = state.doorOpen ? 'Close door' : 'Open door';
  scene.setDoorOpen(hinged && state.doorOpen);

  renderAccessoryList();

  // The scene reads the validated copy, which has option rules applied.
  const result = validateConfig(config);
  scene.update(result.config, state.selectedId);
  renderPrice(result);
}

function renderAccessoryList() {
  const { accessories } = state.config;
  if (!accessories.length) {
    $('accList').innerHTML = '<li class="empty muted small">No accessories yet.</li>';
    return;
  }
  $('accList').innerHTML = accessories.map((acc) => {
    const def = ACCESSORIES[acc.type];
    const where = `${FACE_LABELS[acc.face]}${def.through ? '' : `, ${acc.side}`}`;
    const colorSelect = def.kind === 'fan' ? '' : `
      <select data-action="color" aria-label="LED color">
        ${Object.keys(LED_COLORS).map((c) => `<option value="${c}" ${c === acc.color ? 'selected' : ''}>${c}</option>`).join('')}
      </select>`;
    return `
      <li data-id="${acc.id}" class="${acc.id === state.selectedId ? 'selected' : ''}">
        ${accessoryIcon(def.kind)}
        <span class="acc-name">${def.label}<span class="muted small">${where}</span></span>
        ${colorSelect}
        ${def.through ? '' : `<button type="button" class="icon-btn" data-action="side" title="Mount ${acc.side === 'inside' ? 'outside' : 'inside'}">${acc.side === 'inside' ? 'In' : 'Out'}</button>`}
        ${def.rotatable ? '<button type="button" class="icon-btn" data-action="rotate" title="Rotate 90° (R)">⟳</button>' : ''}
        <button type="button" class="icon-btn danger" data-action="remove" title="Remove (Delete)">✕</button>
      </li>`;
  }).join('');
}

function renderPrice(result) {
  if (!result.ok) {
    $('priceLines').innerHTML = '';
    $('priceTotals').innerHTML = '';
    showErrors(result.errors);
    $('headerTotal').textContent = '—';
    return;
  }
  showErrors([]);
  const p = priceConfig(result.config);
  $('priceLines').innerHTML = p.lines
    .map((l) => `<tr><td>${l.label}</td><td>${money(l.amount)}</td></tr>`).join('')
    + `<tr class="strong"><td>Price per box</td><td>${money(p.unit)}</td></tr>`;
  $('priceTotals').innerHTML = [
    p.discountRate ? `<tr class="good"><td>Volume discount (${p.discountRate * 100}%)</td><td>−${money((p.unit - p.unitAfterDiscount) * p.quantity)}</td></tr>` : '',
    `<tr><td>${p.quantity} × ${money(p.unitAfterDiscount)}</td><td>${money(p.subtotal)}</td></tr>`,
    `<tr><td>Shipping</td><td>${money(p.shipping)}</td></tr>`,
    `<tr class="total"><td>Total</td><td>${money(p.total)}</td></tr>`,
  ].join('');
  $('headerTotal').textContent = money(p.total);
}

function showErrors(errors) {
  $('errors').hidden = !errors.length;
  $('errors').innerHTML = errors.map((e) => `<div>${e}</div>`).join('');
}

// ---------- checkout ----------

async function checkout(e) {
  e.preventDefault();
  const btn = $('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Redirecting to payment…';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: state.config, notes: $('notes').value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.errors || ['Checkout failed']).join('\n'));
    location.href = data.url;
  } catch (err) {
    showErrors(err.message.split('\n'));
    btn.disabled = false;
    btn.textContent = 'Pay & place order';
  }
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

fetch('/api/config').then((r) => r.json()).then(({ payments }) => {
  $('payMode').textContent = payments === 'stripe'
    ? 'Secure card payment by Stripe. We start building once payment clears.'
    : 'Demo mode: orders are recorded but no payment is taken.';
}).catch(() => {});

if (location.hash === '#cancelled') toast('Payment cancelled — your design is still here.');

buildControls();
update();
