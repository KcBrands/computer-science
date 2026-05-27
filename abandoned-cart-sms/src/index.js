/**
 * index.js – Point d'entrée du plugin "Abandoned Cart SMS Reminder"
 *
 * Ce serveur Express reçoit les webhooks Shopify et déclenche
 * des rappels SMS via AWS SNS pour les paniers abandonnés.
 */

require('dotenv').config();

const express = require('express');
const { registerWebhookRoutes } = require('./webhooks');
const { startScheduler }        = require('./scheduler');

const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ─── Middlewares ───────────────────────────────────────────────────────────
// Note: on NE parse PAS le body en JSON globalement ici car les webhooks
//       Shopify ont besoin du rawBody pour la vérification HMAC.
//       Le parsing est fait manuellement dans webhooks.js.

// ─── Routes ────────────────────────────────────────────────────────────────
registerWebhookRoutes(app);

// Route racine
app.get('/', (req, res) => {
  res.json({
    name:    'Abandoned Cart SMS Reminder',
    version: '1.0.0',
    status:  'running',
    endpoints: {
      health:           'GET  /health',
      checkoutWebhook:  'POST /webhooks/checkout',
      orderWebhook:     'POST /webhooks/order',
    },
  });
});

// ─── Démarrage ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🛒 Abandoned Cart SMS Reminder — Démarré!      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Serveur:  http://localhost:${PORT}`);
  console.log(`  Magasin:  ${process.env.STORE_NAME || '(non configuré)'}`);
  console.log(`  Délai:    ${process.env.REMINDER_DELAY_MINUTES || 60} minutes`);
  console.log(`  AWS:      ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log('');

  // Démarre le cron job de vérification
  startScheduler();
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
