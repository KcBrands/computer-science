/**
 * scheduler.js – Vérifie toutes les 5 minutes s'il y a des paniers abandonnés
 *               à rappeler, et envoie les SMS si le délai est dépassé.
 */

const cron = require('node-cron');
const db   = require('./db');
const { sendSms, buildSmsMessage } = require('./sms');

require('dotenv').config();

// Délai en ms avant d'envoyer le rappel (défaut 60 minutes)
const REMINDER_DELAY_MS = (parseInt(process.env.REMINDER_DELAY_MINUTES, 10) || 60) * 60 * 1000;

/**
 * Traite tous les paniers en attente dont le délai est dépassé.
 */
async function processAbandonedCarts() {
  const carts = db.getPendingCarts(REMINDER_DELAY_MS);

  if (carts.length === 0) {
    console.log(`[Scheduler] Aucun panier abandonné à traiter.`);
    return;
  }

  console.log(`[Scheduler] ${carts.length} panier(s) abandonné(s) à traiter.`);

  for (const cart of carts) {
    await remindCart(cart);
  }
}

/**
 * Envoie le SMS de rappel pour un panier donné.
 * @param {object} cart - Ligne de la table abandoned_carts
 */
async function remindCart(cart) {
  const message = buildSmsMessage(cart);
  const result  = await sendSms(cart.customer_phone, message);

  // Log dans la DB
  db.logSms({
    cartId:   cart.id,
    phone:    cart.customer_phone,
    message,
    awsMsgId: result.messageId,
    success:  result.success,
    error:    result.error,
  });

  if (result.success) {
    db.markReminded(cart.checkout_id);
    console.log(`[Scheduler] ✅ Rappel envoyé pour checkout ${cart.checkout_id} → ${cart.customer_phone}`);
  } else {
    console.error(`[Scheduler] ❌ Échec rappel pour checkout ${cart.checkout_id}: ${result.error}`);
  }
}

/**
 * Démarre le cron job (vérifie toutes les 5 minutes).
 */
function startScheduler() {
  const delayMin = Math.round(REMINDER_DELAY_MS / 60000);
  console.log(`[Scheduler] Démarré — délai de rappel: ${delayMin} minute(s)`);
  console.log(`[Scheduler] Vérification toutes les 5 minutes...`);

  // Toutes les 5 minutes: "*/5 * * * *"
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[Scheduler] Vérification paniers abandonnés...`);
    try {
      await processAbandonedCarts();
    } catch (err) {
      console.error('[Scheduler] Erreur:', err.message);
    }
  });

  // Premier scan immédiat au démarrage
  processAbandonedCarts().catch(console.error);
}

module.exports = { startScheduler, processAbandonedCarts, remindCart };
