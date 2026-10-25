# Fonz Fashion launch audit and lock-in plan

Prepared for James Malloy · October 25, 2026
Target working week: October 26–November 1. Target controlled launch: Friday October 30, subject to the acceptance gates below.

## Current evidence

Audited `Credx-Platform/fonzfashion` main at `665fe4c035a11e1edaad97b0d9b440442bdfe9ce` and the production inventories of all seven projects in the accessible Railway workspace. No service in that workspace points to this repository. Another Railway connection requires reauthentication, so hosting outside the accessible workspace is unverified.

The baseline is a static HTML/CSS/JavaScript storefront, not the previously discussed Next.js/Medusa implementation. It contains four $59.99 tees, XS–XL selection, collection routing and a 360-degree garment viewer. In the baseline both add-to-bag actions incremented an in-memory number only; the bag had no open handler. No commerce backend, checkout endpoint, customer/order database, payment webhook, fulfillment integration, account/admin system or order emails were found. Chrome Bear's rear view is explicitly presented as a placeholder. Visual mockups do not verify actual supplier stock or production artwork.

## Implemented on this review branch

- Product/size/quantity cart with refresh persistence, removal, quantity limits and integer-cent subtotal calculations.
- Accessible native cart dialog, status announcements and graceful storage-failure handling.
- Cart interactions avoid triggering the background carousel keyboard/touch/wheel controls.
- Checkout remains explicitly unavailable; nothing claims that an order was placed or a payment succeeded.
- Removed the unverified "$75+ complimentary shipping" promise from the main product panel.
- Dependency-free Node static server, explicit public-file allowlist, Railway port binding and `/health` endpoint. Health reports hosting status and `commerce: not_connected`; it does not claim the store can sell.
- Deployment configuration and meaningful cart validation tests.

## Launch blockers, owners and pass conditions

| Priority | Missing piece | Work to lock it in | Owner / required decision | Pass condition |
|---|---|---|---|---|
| P0 | Real merchandise and fulfillment | Verify supplier, product/variant IDs, artwork rights/files, samples, size chart, costs and available stock; replace placeholder back image | James supplies/approves supplier and artwork; implementation maps variants | Every sellable variant resolves to a real purchasable supplier item; sample fulfillment verified |
| P0 | Commerce backend | Provision isolated Medusa backend/database on Railway; configure US/USD catalog, region, inventory, sales channel and fulfillment | Implementation; preserve separate Fonz namespace | Cart can request server-validated prices/stock and create durable orders |
| P0 | Checkout/payment | Configure Fonz merchant/payment credentials, server-created sessions/payment collections, signed webhooks and replay protection | James grants the intended merchant account access; implementation integrates | Successful, declined and cancelled test payments behave correctly; duplicate webhook creates no second order |
| P0 | Shipping and taxes | Decide origin, destinations, rates/free-shipping rules and delivery windows; configure applicable tax collection | James approves fulfillment facts and tax settings | Correct address-based checkout totals; no invented shipping or tax promises |
| P0 | Order delivery loop | Wire order confirmation, fulfillment status, tracking, cancellation and refunds; establish sender domain | James supplies support/sender identity; implementation connects | A paid test order is visible to admin, acknowledged by supplier and receives confirmation/tracking |
| P0 | Hosting/domain | Deploy the storefront and backend in Fonz's project; attach the actual chosen domain and HTTPS | James provides the domain if not present in existing account | Homepage, product, bag, checkout/return pages and health all pass on the intended HTTPS domain |
| P0 | Policies/support | Publish business contact, shipping, returns/refunds, privacy and terms consistent with actual operations | James approves return window/address and support route | Policies are reachable before payment and match checkout/fulfillment behavior |
| P0 | Release verification | Phone/desktop purchase flow, accessibility, blocked storage/WebGL fallback, stock conflicts, webhook replay, refund and recovery | Implementation; James checks final merchandise/offer | Evidence recorded for a complete test purchase through fulfillment and refund; live mode verified before public launch |
| P1 | Discoverability/analytics | Domain-aware canonical URLs, social preview/favicon, product metadata and privacy-appropriate analytics | Implementation after final domain/catalog | Shared links render correctly; purchase funnel records a verified test without secrets |
| P1 | Operations | Admin roles, credentials, database backup/restore, alerting and runbook | Implementation and store operator | Restore demonstrated; failed payment/email/fulfillment produces an actionable alert |

## Week execution order

Monday October 26: close supplier/catalog/domain/shipping/returns decisions; verify merchant access; merge cart foundation after review.

Tuesday October 27: create the isolated commerce deployment and real catalog/variants; connect storefront to backend; configure shipping/taxes.

Wednesday October 28: payment webhooks, durable order creation, email sender and supplier dispatch/tracking; expose policies and support.

Thursday October 29: full test purchase, decline, cancellation, stock conflict, duplicate webhook and refund; verify phone/browser layouts and recovery.

Friday October 30: controlled launch only after all P0 gates pass; confirm live merchant mode and actual supplier availability. Saturday/Sunday remain a buffer for fulfillment and checkout defects. This is a proposed work plan, not a background schedule or a guaranteed launch date.

## Scope decisions that remain open

Do not reuse Eden's $10 shipping/no-tax settings, merchant credentials, customer records, or policy details by assumption. Do not replace the established Fonz design to solve backend gaps. A quick payment link alone will not complete variant inventory, fulfillment or tracking.

Needed from James: supplier/fulfillment source and actual variants; final production artwork; Fonz domain; shipping/returns decisions; intended merchant/support accounts. Do not paste secret keys into this report or commit them.
