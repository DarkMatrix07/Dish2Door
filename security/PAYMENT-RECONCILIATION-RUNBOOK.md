# Payment inbox operations

The Node Next.js server starts an inbox sweep five seconds after startup, then every 30 seconds. Keep at least one long-running Node server active; this interval is not a serverless scheduler. The signed webhook writes a durable event before trying reconciliation. Failed processing remains pending with exponential retries capped at one hour. Worker restarts replay persisted events. Concurrent workers are safe because payment confirmation uses atomic transitions; event completion is recorded only after confirmation succeeds.

If a provider order ID was not saved locally, the worker fetches the provider order using server credentials and recovers the local order through its receipt. It checks amount, currency, existing mapping, online order source, and server-authored app/orderId notes (or the legacy trackingCode note) before binding it. New provider orders also carry `app=dish2door` and `orderId` notes. Never manually attach a provider payment using only customer-supplied IDs.

Monitor `PaymentEvent` rows where `processedAt IS NULL`, especially `attempts >= 5`. `lastError` holds a fixed diagnostic code, never raw SQL/provider errors. `PROVIDER_MAPPING_CONFLICT`, `INVALID_CAPTURE_EVENT` and `LOCAL_ORDER_MISSING` require operator investigation. Check provider payment/order records and the corresponding local quote; correct the underlying mapping/configuration, then set `nextAttemptAt` to now to retry. Do not mark an event processed merely to clear the queue. Unrelated shared-account orders have `processedAt` set, `matched=false` and `lastError=UNRELATED_PROVIDER_ORDER`.

Payments captured for cancelled orders or legacy coupons with exhausted capacity become refund requests rather than fulfilled orders. Monitor Payment rows with `refundState=REQUESTED`. An operator must issue the refund through the provider, record its reference and confirmed amount, and update its state only after provider confirmation. This change does not automate provider refunds. Do not release a coupon hold merely because a checkout expired: the provider order may still be payable.

## Reclaiming abandoned reservations

Use the existing admin Orders screen to find the pending order by tracking code and choose Cancel. This is a deliberate terminal cancellation, not expiry: the service locks the order, marks it CANCELLED and atomically transitions its HELD reservation to RELEASED while decrementing heldCount. Repeating cancellation cannot release twice. A provider capture racing with cancellation is serialized on the same order lock; capture arriving after cancellation records a refund request and never fulfills the old quote. Tell the customer not to pay that cancelled checkout. This also handles ambiguous provider-create failures after checking the provider dashboard; do not directly decrement heldCount or delete the payment/order.

An EXPIRED checkout remains payable with its original reservation until captured or explicitly cancelled. This conservative policy can hold a coupon longer than five minutes and requires operators to cancel abandoned discounted orders. Provider refunds remain operator-issued and must be verified before recording SUCCEEDED; a replayed capture preserves completed refunds. Cancelled legacy holds are also released when their capture is reconciled.

## Migration validation

The full migration chain passed in disposable PGlite (PostgreSQL WASM), including two legacy pending discounted orders for a one-use coupon, capacity backfill, no further capacity allocation, restricted payment deletion, and rollback on duplicate gateway IDs. This is SQL/migration evidence, not multi-worker PostgreSQL or gateway test-mode proof. Run `node security/test-migration.mjs <temporary-pglite-package>/dist/index.js` to repeat without connecting to any deployed database.

Before production rollout, apply the migration and verify a signed Razorpay test-mode event arriving before local mapping, a replay after server restart, a mismatched amount, and a late captured cancelled checkout. The local regression suite uses synthetic database/provider doubles and cannot establish production credentials, migration health or provider settlement behavior.

## Customer checkout recovery

Checkout retries use a secret capability and idempotency key, returning the same provider order. Browser tabs coordinate with Web Locks where supported; browsers without Web Locks use a best-effort localStorage guard, and browsers blocking storage have only in-tab protection. A deliberately new capability is a new checkout, not proof of customer identity.

Pending capture has a Check payment status action using the signed callback and a capability-bound status lookup. Confirmed payments navigate to tracking; cancelled/refund-review attempts are marked terminal instead of reopening payment. Unpaid expired attempts can be explicitly cancelled before starting a fresh quote. Cancellation rechecks local payment state under the same lock as capture, and late captures still enter refund review. Operators must monitor refund requests; this is not automatic refund issuance.
