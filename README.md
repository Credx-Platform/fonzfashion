# Fonz Fashion

FONZ's existing 3D storefront, with a local persistent cart and Railway hosting foundation.

```sh
npm test
npm start
```

Open `http://localhost:3000`. Railway supplies `PORT`; the server listens on all interfaces. `/health` returns hosting health and explicitly reports commerce as not connected.

**Not commerce-ready:** checkout is disabled. Payments, backend catalog/inventory, orders, fulfillment, policies, support and the final domain remain launch requirements. See [LAUNCH_READINESS.md](LAUNCH_READINESS.md) for evidence, acceptance gates and the week plan. No orders or payment confirmations are simulated.

The server serves only storefront files and named assets; it does not expose repository metadata, launch notes, tests or configuration.
