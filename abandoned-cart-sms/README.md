# 🛒 Abandoned Cart SMS Reminder

Plugin Shopify qui envoie automatiquement un **SMS de rappel** via **AWS SNS** quand un client laisse son panier sans compléter l'achat.

---

## 📋 Comment ça fonctionne

```
Client ajoute au panier
        ↓
Shopify envoie webhook → ton serveur
        ↓
Serveur enregistre le panier + numéro de tél
        ↓
Après 60 min (configurable) → SMS envoyé via AWS SNS
        ↓
Si le client achète avant → SMS annulé ✅
```

---

## 🚀 Installation

### 1. Prérequis

- Node.js 18+
- Un compte AWS avec SNS activé
- Un magasin Shopify

### 2. Installer les dépendances

```bash
cd abandoned-cart-sms
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Édite `.env` avec tes vraies valeurs :

```env
SHOPIFY_WEBHOOK_SECRET=  # Dans Shopify Admin → Paramètres → Notifications
AWS_ACCESS_KEY_ID=       # Tes credentials AWS
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
STORE_NAME=Mon Magasin
STORE_URL=https://mon-magasin.myshopify.com
REMINDER_DELAY_MINUTES=60
PORT=3000
```

### 4. Configurer AWS SNS pour les SMS

1. Va dans **AWS Console → SNS → SMS sandbox**
2. Vérifie ton numéro de destination (en mode sandbox)
3. En production : demande la sortie du sandbox SNS

**Permissions IAM minimales requises :**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["sns:Publish"],
    "Resource": "*"
  }]
}
```

### 5. Exposer ton serveur avec ngrok (développement)

```bash
# Terminal 1 - Lance le serveur
npm run dev

# Terminal 2 - Expose avec ngrok
ngrok http 3000
```

Copie l'URL ngrok (ex: `https://abc123.ngrok.io`)

### 6. Configurer les webhooks Shopify

Dans **Shopify Admin → Paramètres → Notifications → Webhooks** :

| Événement | URL |
|-----------|-----|
| Checkout créé | `https://abc123.ngrok.io/webhooks/checkout` |
| Checkout mis à jour | `https://abc123.ngrok.io/webhooks/checkout` |
| Commande créée | `https://abc123.ngrok.io/webhooks/order` |

**Format :** JSON  
**Version API :** 2024-01 (ou plus récente)

---

## 🧪 Tester

```bash
# Tests de base (sans SMS réel)
npm test

# Test avec envoi SMS réel
node src/test.js +15141234567
```

---

## 📱 Exemple de SMS envoyé

```
Jean, tu as oublié quelque chose! 🛒

Ton panier chez Mon Magasin t'attend:
• T-shirt Bleu (x2)
• Casquette Rouge (x1)
 ($69.97 CAD)

Finalise ta commande ici:
https://mon-magasin.myshopify.com/cart/recover?token=abc123

Pour ne plus recevoir de rappels, réponds STOP.
```

---

## 🌐 Déploiement en production

### Option A – Railway.app (recommandé, gratuit)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B – Heroku

```bash
heroku create mon-plugin-cart
heroku config:set $(cat .env | grep -v '^#' | xargs)
git push heroku main
```

### Option C – VPS / EC2

```bash
# Avec PM2 pour garder le serveur actif
npm install -g pm2
pm2 start src/index.js --name abandoned-cart-sms
pm2 save
pm2 startup
```

---

## 📁 Structure du projet

```
abandoned-cart-sms/
├── src/
│   ├── index.js      ← Serveur Express principal
│   ├── webhooks.js   ← Gestion des webhooks Shopify
│   ├── scheduler.js  ← Cron job (vérifie les paniers toutes les 5 min)
│   ├── sms.js        ← Envoi SMS via AWS SNS
│   ├── db.js         ← Base de données SQLite
│   └── test.js       ← Tests manuels
├── data/
│   └── carts.db      ← Base de données (créée automatiquement)
├── .env.example
├── package.json
└── README.md
```

---

## ⚙️ Configuration avancée

| Variable | Défaut | Description |
|----------|--------|-------------|
| `REMINDER_DELAY_MINUTES` | `60` | Minutes avant d'envoyer le rappel |
| `AWS_REGION` | `us-east-1` | Région AWS SNS |
| `STORE_NAME` | — | Nom du magasin (dans le SMS) |
| `STORE_URL` | — | URL du magasin |

---

## 📊 Logs

Le plugin garde un historique dans SQLite :
- `abandoned_carts` : tous les paniers détectés
- `sms_log` : historique des SMS envoyés

---

## ⚠️ Note légale

Assure-toi d'obtenir le **consentement** des clients avant de leur envoyer des SMS marketing (requis par les lois CASL au Canada et CAN-SPAM aux États-Unis). La mention "Réponds STOP" dans le message est incluse par défaut.
