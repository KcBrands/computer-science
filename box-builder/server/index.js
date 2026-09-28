import express from 'express';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, priceConfig, describeConfig } from '../shared/catalog.js';
import { createOrderStore } from './orders.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({
  stripeKey = process.env.STRIPE_SECRET_KEY,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  adminToken = process.env.ADMIN_TOKEN,
  ordersFile = process.env.ORDERS_FILE || path.join(root, 'data', 'orders.json'),
  publicUrl = process.env.PUBLIC_URL,
} = {}) {
  const app = express();
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  const orders = createOrderStore(ordersFile);
  const baseUrl = (req) => publicUrl || `${req.protocol}://${req.get('host')}`;

  // Stripe needs the raw body to verify the signature, so register before express.json().
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !webhookSecret) return res.status(404).end();
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook error: ${err.message}`);
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata && session.metadata.orderId;
      if (orderId && session.payment_status === 'paid') {
        await orders.update(orderId, {
          status: 'paid',
          customer: {
            email: session.customer_details?.email,
            name: session.customer_details?.name,
            address: session.shipping_details?.address || session.customer_details?.address,
          },
        });
      }
    }
    res.json({ received: true });
  });

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/config', (req, res) => {
    res.json({ payments: stripe ? 'stripe' : 'demo' });
  });

  app.post('/api/quote', (req, res) => {
    const result = validateConfig(req.body);
    if (!result.ok) return res.status(400).json({ errors: result.errors });
    res.json({ config: result.config, price: priceConfig(result.config) });
  });

  app.post('/api/checkout', async (req, res, next) => {
    try {
      const result = validateConfig(req.body && req.body.config);
      if (!result.ok) return res.status(400).json({ errors: result.errors });
      const { config } = result;
      const price = priceConfig(config);
      const order = await orders.add({
        id: `BX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        createdAt: new Date().toISOString(),
        status: 'pending_payment',
        notes: String((req.body && req.body.notes) || '').slice(0, 1000),
        description: describeConfig(config),
        config,
        price,
      });

      if (!stripe) {
        // Demo mode: no payment provider configured, just record the order.
        await orders.update(order.id, { status: 'demo' });
        return res.json({ url: `/success.html?order=${order.id}&demo=1` });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: config.quantity,
            price_data: {
              currency: price.currency,
              unit_amount: Math.round(price.unitAfterDiscount * 100),
              product_data: { name: 'Custom enclosure', description: order.description },
            },
          },
          {
            quantity: 1,
            price_data: {
              currency: price.currency,
              unit_amount: Math.round(price.shipping * 100),
              product_data: { name: 'Shipping' },
            },
          },
        ],
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        metadata: { orderId: order.id },
        success_url: `${baseUrl(req)}/success.html?order=${order.id}`,
        cancel_url: `${baseUrl(req)}/#cancelled`,
      });
      await orders.update(order.id, { stripeSessionId: session.id });
      res.json({ url: session.url });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/orders/:id', async (req, res) => {
    const order = await orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { id, status, createdAt, description, config, price } = order;
    res.json({ id, status, createdAt, description, config, price });
  });

  app.get('/api/admin/orders', async (req, res) => {
    if (!adminToken || req.get('authorization') !== `Bearer ${adminToken}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json((await orders.list()).reverse());
  });

  app.use('/shared', express.static(path.join(root, 'shared')));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));
  app.use(express.static(path.join(root, 'public')));

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ errors: ['Something went wrong, please try again.'] });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(port, () => {
    const mode = process.env.STRIPE_SECRET_KEY ? 'Stripe' : 'demo (no STRIPE_SECRET_KEY set)';
    console.log(`Box builder running on http://localhost:${port} — payments: ${mode}`);
  });
}
