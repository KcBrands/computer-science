/**
 * db.js – Base de données SQLite locale
 * Garde en mémoire les paniers abandonnés et leur statut.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'carts.db');

// Crée le dossier data si inexistant
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// ─── Création des tables ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS abandoned_carts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    checkout_id     TEXT    UNIQUE NOT NULL,   -- ID Shopify du checkout
    customer_phone  TEXT    NOT NULL,           -- Numéro de tel du client
    customer_name   TEXT,                       -- Prénom du client
    cart_url        TEXT,                       -- Lien pour reprendre le panier
    items_summary   TEXT,                       -- Résumé des articles (JSON)
    total_price     TEXT,                       -- Montant total
    created_at      INTEGER NOT NULL,           -- Timestamp UNIX (ms)
    reminded_at     INTEGER,                    -- Quand le SMS a été envoyé
    status          TEXT    DEFAULT 'pending'   -- pending | reminded | purchased | cancelled
  );

  CREATE TABLE IF NOT EXISTS sms_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cart_id     INTEGER,
    phone       TEXT,
    message     TEXT,
    aws_msg_id  TEXT,
    sent_at     INTEGER NOT NULL,
    success     INTEGER NOT NULL DEFAULT 0,  -- 0 = échec, 1 = succès
    error       TEXT
  );
`);

// ─── Requêtes préparées ────────────────────────────────────────────────────

const stmts = {
  upsertCart: db.prepare(`
    INSERT INTO abandoned_carts
      (checkout_id, customer_phone, customer_name, cart_url, items_summary, total_price, created_at, status)
    VALUES
      (@checkout_id, @customer_phone, @customer_name, @cart_url, @items_summary, @total_price, @created_at, 'pending')
    ON CONFLICT(checkout_id) DO UPDATE SET
      customer_phone = excluded.customer_phone,
      customer_name  = excluded.customer_name,
      cart_url       = excluded.cart_url,
      items_summary  = excluded.items_summary,
      total_price    = excluded.total_price
  `),

  markPurchased: db.prepare(`
    UPDATE abandoned_carts
    SET status = 'purchased'
    WHERE checkout_id = @checkout_id
  `),

  markReminded: db.prepare(`
    UPDATE abandoned_carts
    SET status = 'reminded', reminded_at = @reminded_at
    WHERE checkout_id = @checkout_id
  `),

  getPendingCarts: db.prepare(`
    SELECT * FROM abandoned_carts
    WHERE status = 'pending'
      AND created_at <= @cutoff
  `),

  getCartByCheckoutId: db.prepare(`
    SELECT * FROM abandoned_carts WHERE checkout_id = @checkout_id
  `),

  logSms: db.prepare(`
    INSERT INTO sms_log (cart_id, phone, message, aws_msg_id, sent_at, success, error)
    VALUES (@cart_id, @phone, @message, @aws_msg_id, @sent_at, @success, @error)
  `),
};

// ─── Fonctions exportées ───────────────────────────────────────────────────

/**
 * Enregistre ou met à jour un checkout (panier).
 */
function saveCart(cartData) {
  return stmts.upsertCart.run(cartData);
}

/**
 * Marque un checkout comme acheté (annule le rappel).
 */
function markPurchased(checkoutId) {
  return stmts.markPurchased.run({ checkout_id: checkoutId });
}

/**
 * Marque un panier comme "rappel envoyé".
 */
function markReminded(checkoutId) {
  return stmts.markReminded.run({
    checkout_id: checkoutId,
    reminded_at: Date.now(),
  });
}

/**
 * Récupère tous les paniers en attente dont le délai est dépassé.
 * @param {number} delayMs - Délai en millisecondes avant rappel
 */
function getPendingCarts(delayMs) {
  const cutoff = Date.now() - delayMs;
  return stmts.getPendingCarts.all({ cutoff });
}

/**
 * Log d'envoi SMS.
 */
function logSms({ cartId, phone, message, awsMsgId, success, error }) {
  return stmts.logSms.run({
    cart_id:   cartId,
    phone,
    message,
    aws_msg_id: awsMsgId || null,
    sent_at:   Date.now(),
    success:   success ? 1 : 0,
    error:     error || null,
  });
}

module.exports = { saveCart, markPurchased, markReminded, getPendingCarts, logSms };
