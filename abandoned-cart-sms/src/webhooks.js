/**
 * webhooks.js – Gestionnaire des webhooks Shopify
 *
 * Webhooks à configurer dans Shopify Admin:
 *   → checkouts/create   : quand un checkout est créé
 *   → checkouts/update   : quand un checkout est mis à jour (tel ajouté, etc.)
 *   → orders/create      : quand une commande est complétée (annule le rappel)
 */

const crypto = require('crypto');
const db     = require('./db');
require('dotenv').config();

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// ─── Vérification HMAC Shopify ─────────────────────────────────────────────

/**
 * Vérifie que la requête vient bien de Shopify.
 * @param {Buffer} rawBody  - Corps brut de la requête
 * @param {string} hmacHeader - Header X-Shopify-Hmac-Sha256
 * @returns {boolean}
 */
function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] ⚠️  SHOPIFY_WEBHOOK_SECRET non défini — vérification HMAC désactivée');
    return true; // À activer en production!
  }
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');

  // Comparaison en temps constant pour éviter les timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(hmacHeader)
  );
}

// ─── Extracteurs de données Shopify ───────────────────────────────────────

/**
 * Extrait le numéro de téléphone d'un payload checkout Shopify.
 * Priorité: billing_address.phone → shipping_address.phone → customer.phone
 */
function extractPhone(payload) {
  return (
    payload?.billing_address?.phone ||
    payload?.shipping_address?.phone ||
    payload?.customer?.phone ||
    null
  );
}

/**
 * Extrait le prénom+nom du client.
 */
function extractCustomerName(payload) {
  const c = payload?.customer;
  if (c?.first_name || c?.last_name) {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }
  return payload?.billing_address?.name || payload?.shipping_address?.name || null;
}

/**
 * Construit le résumé JSON des articles du panier.
 */
function extractItemsSummary(payload) {
  const lineItems = payload?.line_items || [];
  const items = lineItems.map(item => ({
    title:    item.title,
    quantity: item.quantity,
    price:    item.price,
  }));
  return JSON.stringify(items);
}

// ─── Handlers ──────────────────────────────────────────────────────────────

/**
 * Handler: checkouts/create et checkouts/update
 * Enregistre ou met à jour le panier en attente.
 */
function handleCheckoutEvent(payload) {
  const phone = extractPhone(payload);

  if (!phone) {
    console.log(`[Webhook] Checkout ${payload.id} ignoré — pas de numéro de téléphone.`);
    return { ignored: true, reason: 'no_phone' };
  }

  const cartData = {
    checkout_id:    String(payload.id),
    customer_phone: phone,
    customer_name:  extractCustomerName(payload),
    cart_url:       payload.abandoned_checkout_url || payload.cart_url || null,
    items_summary:  extractItemsSummary(payload),
    total_price:    payload.total_price ? `$${payload.total_price} CAD` : null,
    created_at:     Date.now(),
  };

  db.saveCart(cartData);
  console.log(`[Webhook] 🛒 Checkout enregistré: ${cartData.checkout_id} | Client: ${cartData.customer_name || 'Inconnu'} | Tél: ${phone}`);
  return { saved: true, checkoutId: cartData.checkout_id };
}

/**
 * Handler: orders/create
 * Marque le checkout comme complété → annule le rappel SMS.
 */
function handleOrderCreated(payload) {
  // Shopify lie l'order au checkout via checkout_id
  const checkoutId = payload?.checkout_id;

  if (checkoutId) {
    db.markPurchased(String(checkoutId));
    console.log(`[Webhook] ✅ Commande reçue pour checkout ${checkoutId} — rappel annulé.`);
    return { cancelled: true, checkoutId: String(checkoutId) };
  }

  // Fallback: cherche par numéro de tel si pas de checkout_id
  console.log(`[Webhook] Commande ${payload.id} sans checkout_id lié.`);
  return { cancelled: false };
}

// ─── Middleware Express ────────────────────────────────────────────────────

/**
 * Enregistre les routes webhook sur l'app Express.
 * @param {Express} app
 */
function registerWebhookRoutes(app) {
  // Middleware pour capturer le corps brut (nécessaire pour la vérif HMAC)
  app.use('/webhooks', (req, res, next) => {
    let data = [];
    req.on('data', chunk => data.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(data);
      next();
    });
  });

  // ── POST /webhooks/checkout ─────────────────────────────────────────────
  app.post('/webhooks/checkout', (req, res) => {
    const hmac = req.headers['x-shopify-hmac-sha256'];

    if (!verifyShopifyWebhook(req.rawBody, hmac)) {
      console.warn('[Webhook] ⛔ HMAC invalide — requête rejetée');
      return res.status(401).send('Unauthorized');
    }

    let payload;
    try {
      payload = JSON.parse(req.rawBody.toString('utf8'));
    } catch (e) {
      return res.status(400).send('Invalid JSON');
    }

    const topic = req.headers['x-shopify-topic'] || '';
    console.log(`[Webhook] Topic reçu: ${topic}`);

    handleCheckoutEvent(payload);

    // Shopify exige une réponse 200 rapide
    res.status(200).send('OK');
  });

  // ── POST /webhooks/order ────────────────────────────────────────────────
  app.post('/webhooks/order', (req, res) => {
    const hmac = req.headers['x-shopify-hmac-sha256'];

    if (!verifyShopifyWebhook(req.rawBody, hmac)) {
      console.warn('[Webhook] ⛔ HMAC invalide — requête rejetée');
      return res.status(401).send('Unauthorized');
    }

    let payload;
    try {
      payload = JSON.parse(req.rawBody.toString('utf8'));
    } catch (e) {
      return res.status(400).send('Invalid JSON');
    }

    handleOrderCreated(payload);
    res.status(200).send('OK');
  });

  // ── GET /health ─────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'abandoned-cart-sms', timestamp: new Date().toISOString() });
  });
}

module.exports = { registerWebhookRoutes, verifyShopifyWebhook };
