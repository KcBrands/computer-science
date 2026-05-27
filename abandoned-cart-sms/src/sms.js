/**
 * sms.js – Envoi de SMS via AWS SNS
 * Utilise le mode "Direct Publish" d'AWS SNS (pas besoin de topic).
 */

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
require('dotenv').config();

// ─── Client AWS SNS ────────────────────────────────────────────────────────
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Formate le message SMS de rappel.
 * @param {object} cart - Données du panier
 * @returns {string} Message SMS
 */
function buildSmsMessage(cart) {
  const storeName = process.env.STORE_NAME || 'Notre magasin';
  const storeUrl  = process.env.STORE_URL  || '';

  const firstName = cart.customer_name
    ? cart.customer_name.split(' ')[0]
    : 'Bonjour';

  const items = (() => {
    try {
      const parsed = JSON.parse(cart.items_summary);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(i => `• ${i.title} (x${i.quantity})`).join('\n');
      }
    } catch (_) {}
    return '';
  })();

  const total = cart.total_price ? ` (Total: ${cart.total_price})` : '';
  const cartLink = cart.cart_url || storeUrl;

  return [
    `${firstName}, tu as oublié quelque chose! 🛒`,
    ``,
    `Ton panier chez ${storeName} t'attend:`,
    items || '(Voir ton panier)',
    `${total}`,
    ``,
    `Finalise ta commande ici:`,
    cartLink,
    ``,
    `Pour ne plus recevoir de rappels, réponds STOP.`,
  ]
    .filter(line => line !== null)
    .join('\n');
}

/**
 * Envoie un SMS à un numéro de téléphone via AWS SNS.
 * @param {string} phoneNumber - Numéro E.164, ex: +15141234567
 * @param {string} message     - Contenu du SMS
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendSms(phoneNumber, message) {
  // Normalise le numéro (doit être E.164 pour SNS)
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) {
    return { success: false, error: `Numéro invalide: ${phoneNumber}` };
  }

  const command = new PublishCommand({
    PhoneNumber: normalized,
    Message:     message,
    MessageAttributes: {
      // Type "Transactional" = meilleure fiabilité de livraison
      'AWS.SNS.SMS.SMSType': {
        DataType:    'String',
        StringValue: 'Transactional',
      },
      // Nom de l'expéditeur (11 chars max, pas disponible dans toutes les régions)
      ...(process.env.STORE_NAME && {
        'AWS.SNS.SMS.SenderID': {
          DataType:    'String',
          StringValue: process.env.STORE_NAME.slice(0, 11).replace(/\s+/g, ''),
        },
      }),
    },
  });

  try {
    const response = await snsClient.send(command);
    console.log(`[SMS] ✅ Envoyé à ${normalized} | MessageId: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId };
  } catch (err) {
    console.error(`[SMS] ❌ Erreur envoi à ${normalized}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Normalise un numéro de téléphone au format E.164.
 * Supporte les formats canadiens/américains et internationaux.
 * @param {string} phone
 * @returns {string|null}
 */
function normalizePhone(phone) {
  if (!phone) return null;

  // Supprime tout sauf chiffres et +
  let clean = phone.replace(/[^\d+]/g, '');

  // Déjà au format E.164
  if (/^\+\d{10,15}$/.test(clean)) return clean;

  // Numéro nord-américain à 10 chiffres → +1XXXXXXXXXX
  if (/^\d{10}$/.test(clean)) return `+1${clean}`;

  // Numéro nord-américain à 11 chiffres commençant par 1
  if (/^1\d{10}$/.test(clean)) return `+${clean}`;

  console.warn(`[SMS] ⚠️  Format de numéro non reconnu: ${phone}`);
  return null;
}

module.exports = { sendSms, buildSmsMessage };
