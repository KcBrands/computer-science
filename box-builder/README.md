# Custom Box Builder

A web shop where customers design their own metal enclosure in 3D, drop LED
lights and fans exactly where they want them, and pay online.

## What customers can do

- **Size** – width, height and depth in millimetres.
- **Style** – hinged door, louvered (vented) cover, or screw-on cover.
- **Material & finish** – steel, galvanized, aluminum, stainless; five colours.
- **Options** – key lock, internal mounting plate, wall tabs, IP54 gasket, cable knockouts.
- **LEDs & fans** – pick a fan (80/120 mm), LED strip or LED indicator, then click
  on any panel of the 3D model to place it. Drag to move, rotate strips, choose the
  LED colour, and mount LEDs inside or outside (open the door to reach the inside).
- **Live price** – itemised, with volume discounts (5+, 10+, 25+) and shipping.
- **Share / save** – the design lives in the page URL, so a link reopens it.
- **Pay & order** – Stripe Checkout; the order (with every accessory position) is saved.

The price is always recalculated on the server from the design, so editing the
page cannot change what a customer pays.

## Run it

```bash
cd box-builder
npm install
npm start            # http://localhost:3000
npm test
```

Without Stripe keys the site runs in **demo mode**: orders are recorded but no
payment is taken.

## Taking real payments

1. Create a [Stripe](https://stripe.com) account and copy the secret key.
2. Start the server with environment variables:

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Enables Stripe Checkout (`sk_test_…` while testing) |
| `STRIPE_WEBHOOK_SECRET` | Marks orders as `paid` when Stripe confirms payment |
| `PUBLIC_URL` | Your site address, used for the return links (e.g. `https://boxes.example.com`) |
| `ADMIN_TOKEN` | Password for the order list API |
| `PORT` | Port to listen on (default 3000) |

3. In the Stripe dashboard add a webhook to `https://<your-site>/api/stripe/webhook`
   for the `checkout.session.completed` event.

## Seeing orders

Orders are stored in `data/orders.json`. To list them:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/admin/orders
```

Each order contains the full design: dimensions, style, material, colour,
options and, for every accessory, its panel (`front`, `back`, `left`, `right`,
`top`, `bottom`), position (`u`/`v` from −0.5 to 0.5 across the panel, measured
from the centre as seen from outside), rotation, side (inside/outside) and colour.

## Changing products and prices

Everything sellable is in [`shared/catalog.js`](shared/catalog.js): size limits,
materials and price per m², styles, colours, options, accessories (size, price,
install fee), quantity discounts and shipping. The browser and the server both
use this file, so a change there updates the page and the checkout together.

## Project layout

```
server/index.js    Express server: quote, checkout (Stripe), webhook, orders API
server/orders.js   JSON file order store (swap for a database in production)
shared/catalog.js  Catalog, pricing and validation (browser + server)
public/            Configurator page, 3D scene (three.js), success page
test/              node:test suites
```
