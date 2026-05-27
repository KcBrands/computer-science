/**
 * test.js – Tests manuels du plugin
 * Lance avec: node src/test.js
 */

require('dotenv').config();

const db  = require('./db');
const { buildSmsMessage } = require('./sms');

console.log('\n🧪 Tests du plugin Abandoned Cart SMS Reminder\n');

// ─── Test 1: Sauvegarde d'un panier ───────────────────────────────────────
console.log('Test 1: Sauvegarder un panier...');

const testCart = {
  checkout_id:    'TEST-CHECKOUT-001',
  customer_phone: '+15141234567',
  customer_name:  'Jean Tremblay',
  cart_url:       'https://mon-magasin.myshopify.com/cart/recover?token=abc123',
  items_summary:  JSON.stringify([
    { title: 'T-shirt Bleu',    quantity: 2, price: '24.99' },
    { title: 'Casquette Rouge', quantity: 1, price: '19.99' },
  ]),
  total_price:    '$69.97 CAD',
  created_at:     Date.now() - (2 * 60 * 60 * 1000), // Il y a 2 heures
};

db.saveCart(testCart);
console.log('✅ Panier sauvegardé\n');

// ─── Test 2: Génération du message SMS ────────────────────────────────────
console.log('Test 2: Générer le message SMS...\n');

const dbCart = {
  ...testCart,
  id: 1,
};

const message = buildSmsMessage(dbCart);
console.log('─── Message SMS ───────────────────────────────────');
console.log(message);
console.log('───────────────────────────────────────────────────\n');

// ─── Test 3: Vérifier les paniers en attente ──────────────────────────────
console.log('Test 3: Paniers en attente (délai 60 min)...');
const pending = db.getPendingCarts(60 * 60 * 1000);
console.log(`✅ ${pending.length} panier(s) en attente trouvé(s)\n`);

// ─── Test 4: Simuler commande reçue ───────────────────────────────────────
console.log('Test 4: Simuler une commande (annuler le rappel)...');
db.markPurchased('TEST-CHECKOUT-001');
const pendingAfter = db.getPendingCarts(60 * 60 * 1000);
console.log(`✅ Après achat: ${pendingAfter.length} panier(s) en attente\n`);

// ─── Test 5: Envoi SMS réel (optionnel) ───────────────────────────────────
const testPhone = process.argv[2];
if (testPhone) {
  console.log(`Test 5: Envoi SMS réel à ${testPhone}...`);
  const { sendSms } = require('./sms');
  sendSms(testPhone, '🧪 Test SMS - Plugin Abandoned Cart fonctionne!')
    .then(r => {
      if (r.success) console.log(`✅ SMS envoyé! MessageId: ${r.messageId}`);
      else console.error(`❌ Erreur: ${r.error}`);
    })
    .catch(console.error);
} else {
  console.log('ℹ️  Pour tester l\'envoi SMS réel: node src/test.js +15141234567\n');
}

console.log('✅ Tous les tests de base passés!\n');
