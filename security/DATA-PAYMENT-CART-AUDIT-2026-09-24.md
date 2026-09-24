# Focused data, payment and cart audit

24 September 2026. Follow-up to `SECURITY-AUDIT-2026-09-24.md`. Findings only; application code has not been patched.

**There are confirmed privacy and checkout-integrity weaknesses. This review does not establish that anyone has stolen data or money.** The checks used synthetic in-memory records and the actual imported application functions; no real accounts, payments or notifications were used. Full HTTP/RSC behavior, database concurrency and production infrastructure remain untested.

## Data exposure: what is accessible and to whom

| Surface | What is returned/stored | Access requirement | Assessment |
|---|---|---|---|
| `/api/customer/identify` | Reviewed/unrated activity, daily spin state, outstanding reward code | Any correctly formatted supplied phone; no proof of ownership | **High: confirmed unauthorized customer activity/reward disclosure** |
| `/api/customer/spin` and `/forfeit` | Reward issuance or loyalty mutation | Supplied phone | **High: customer impersonation**, already documented in S03 |
| `/api/tracking/[code]/verify` | Full order scalars, customer email/phone, receiver name, handover note, delivery worker name/phone, internal session metadata | Tracking code plus order PIN or delivered-order review PIN | **Medium: excessive response fields**, reproduced with a valid fixture PIN |
| Delivered-order review PIN | Unlocks that same full tracking response | Tracking code plus deterministic four-digit review PIN | **Medium: overbroad, non-expiring credential**, reproduced for a 2020 fixture order |
| Delivery API/client props | Accessible orders including `trackingPasscodeHash` | Delivery staff role and matching released hostel-block assignment | **Medium: credential-verifier exposure**, S07; source-confirmed |
| `/api/orders/create-payment` | New order ID, authoritative amount, gateway order ID, public Razorpay key ID, submitted customer contact snapshot | Guest checkout | No historical customer-record lookup/disclosure found in this response |
| `/api/orders/verify-payment` | Tracking code and first-confirmation PIN; replay returns a null PIN | Valid Razorpay HMAC for the mapped gateway order/payment | Tested response is narrow; signature is a sensitive bearer proof |
| Public menu/cart server props | Menu, prices, campuses, fee settings, aggregate popularity/counts | Public | No individual customer/order records found in these projections |
| Browser localStorage | Customer name, email, phone and ordinary cart contents | Same browser profile or script executing on the site origin | **Low/Medium shared-device privacy exposure**; persists without app expiry/forget-details action |
| Browser sessionStorage | Order PIN briefly during the post-payment redirect | Same origin/tab context | Cleared when TrackingClient reads it; do not misreport as persistent localStorage payment-card storage |

### Tracking response needs an explicit field allowlist

`app/api/tracking/[trackingCode]/verify/route.ts:53` removes only the hash from a full Prisma order result. `lib/order-select.ts:1` includes restaurant, order session, items, rating, campus and delivery worker contact details. A TypeScript interface in the client does not remove unexpected fields from the network response.

The fixture test received `deliveredBy.phone`, `receivedBy`, `deliveryNote`, and `session.id`, although these are not needed by the current tracking UI. These fields can include another student's name or a worker's personal number. A valid PIN is still required; this is not evidence that a tracking URL alone exposes every order.

Fix: select and serialize only fields needed for tracking. Decide deliberately whether any handover contact details should be customer-visible. Never include staff contact data or internal session metadata merely because it exists on a shared Prisma include.

### Review credentials do not expire and grant too much access

`lib/order-codes.ts:29–51` derives a stable four-digit review PIN from the order code and server secret. The tracking handler accepts it for every delivered order without checking deliveredAt, token age or whether a review was already submitted. The test created a synthetic delivered order dated 2020 and successfully used its review PIN to retrieve the full order response.

Fix: separate tracking and review permissions; use a high-entropy, expiring, revocable review token and return minimal review context. Set a retention/access lifetime for historical tracking data. A short reminder-sending window does not impose a credential expiry.

### Shared-device cart/contact retention

`lib/customer-identity.ts:24` stores name, email and phone indefinitely in localStorage. `lib/cart.ts:32` persists the cart separately. `components/customer/CartPageClient.tsx:213` automatically restores identity and looks up rewards. Successful payment clears cart items at `:381`, not the stored identity. A person reopening the same browser profile can see the earlier user's details and interact with that phone's unverified loyalty state.

Fix: provide a visible forget/switch-customer action, make remembering details optional, apply an expiry and bind loyalty to verified identity. Do not describe localStorage as publicly downloadable; cross-origin sites ordinarily cannot read it. Same-origin XSS or a compromised injected script would change that risk, but no such execution primitive was demonstrated here.

## Payments: confirmed weaknesses and controls that held

**Confirmed or previously source-confirmed risks:**

1. **Coupon financial abuse:** the baseline probe created two discounted pending orders and confirmed both against a one-use coupon. Reserve coupon capacity atomically before pricing the gateway order (S04).
2. **Late payment loss:** five-minute cleanup deletes pending orders and their payment mappings (S08). This pass additionally verified that a correctly signed `payment.captured` webhook for a missing mapping returns HTTP 200. Unrelated payments on a shared gateway account may reasonably be ignored, but deleted mappings make a legitimate late payment indistinguishable from an unrelated one. Retain mappings and reconcile expired checkouts.
3. **Capture is not checked on browser verification:** signed checkout data is sufficient to set PAID_ONLINE; captured status is not fetched on that path (S09). Gateway capture settings and delayed/failing capture still require test-mode validation. This is not a finding that an arbitrary forged signature succeeds.
4. **Refund flag is bookkeeping:** marking REFUNDED does not call the payment provider. Ensure staff have completed the external refund and recorded its reference before representing it as paid back to the customer.
5. **Checkout is not idempotent:** each create-payment request creates a new order. The client clears busy immediately after opening the payment modal (`components/customer/CartPageClient.tsx:394`), rather than at payment completion/dismissal. Multiple tabs/retries can create several payable orders for one intended cart. This is a duplicate-payment/operational risk, not proof of an automatic extra charge. Use a stable checkout-attempt key and resume/reconcile an existing pending gateway order.

**Controls directly tested:**

- A forged payment signature returns 400 before database payment lookup or mutation.
- A valid signature for payment/order A, with the client application order ID changed to B, confirms only mapped order A. B stays pending.
- Replaying the same already-confirmed signed payment returns a null PIN rather than disclosing/reissuing the original plaintext PIN.
- The successful verification response contains only `trackingCode` and `passcode` in the tested route.
- Injecting a cheap item price, 100% item discount, negative fee and custom grand total into checkout service inputs does not replace server-side pricing. The fixture remained priced at its database amount.

The test signatures were generated using an audit-only secret. This demonstrates route behavior, not the ability to forge production signatures. Signature replay before the legitimate first confirmation would require obtaining someone else's valid payment response; no path to obtain it was demonstrated.

## Cart: additional checkout bugs

### Disabled default campus still accepts orders — Medium operational impact

`lib/campus.ts:42` returns the fallback default campus without checking `active`. If the default campus is disabled, an explicit request for it first fails the active check but then returns the same disabled row through fallback. Invalid campus codes also silently fall back rather than being rejected.

The probe disabled the default campus and successfully created an order referencing it. Other shop/window rules still apply. This can accept orders/charges for a campus administrators believe is closed; it does not demonstrate delivery to a different campus for a lower fee.

Fix: reject explicitly unknown/inactive campus codes; any backward-compatible fallback must itself be active. Validate that the saved fulfillment campus matches the customer's confirmed choice.

### Duplicate lines bypass an aggregate quantity cap — Low; Medium if a real business limit

`app/api/orders/create-payment/route.ts:35` limits quantity to 20 per line, but duplicate menu/combo IDs and total line count are not limited. `lib/orders.ts` resolves each line independently. The probe supplied two lines of 20 of the same item and created a 40-unit order. **All 40 units were charged correctly.** This is not free-food or negative-price exploitation.

Fix: combine identical IDs server-side, enforce intended per-item/per-order caps and bound cart size before creating database/provider work. Route tests confirmed that individual quantities -1, 0, 1.5 and 21 are rejected.

### Client totals can differ from the final server quote — source observation

The cart displays stored item prices and previously validated coupon percentages. Server checkout re-reads prices and coupon eligibility, which is correct for security. The client then opens Razorpay with the returned amount without first showing an updated itemized quote. An expired coupon or changed menu price can therefore alter the amount between cart review and provider checkout. The provider displays its payment amount, so this is a transparency/consent issue rather than a demonstrated hidden charge.

Fix: return the authoritative breakdown and require confirmation when the quote differs materially from the reviewed cart. Keep server pricing authoritative.

## Tracking denial and enumeration

The test confirmed that wrong PINs return no order data. However, eight failures keyed only by tracking code block even the correct PIN for the window. Someone knowing a tracking code can temporarily deny its owner access (S10). Unknown codes return 404 whereas wrong PINs for an existing order return 401, allowing an existence check. Random seven-character tracking codes reduce practical broad enumeration; no bulk extraction was demonstrated.

Fix: combine bounded per-source and per-order controls, uniform outward failures where appropriate, and a recovery path that does not enable unlimited guesses or easy owner lockout.

## Secrets and external data flows

- Exact-value scan: **6 configured local secret values checked against 49 existing public/static text assets; zero matches.** `security/scan-public-secret-values.mjs` reports only names/paths if a match occurs and never prints values. This is not a fresh production build, a git-history scan, an encoded-secret scan, or proof that no other secret exists.
- No direct source path was found exposing the Razorpay secret, database URL, mailer secret, WhatsApp service key or Telegram token to public client props. The returned Razorpay key ID is the public integration identifier, not the secret signing key.
- The app delegates payment entry to Razorpay; no app schema/form storing card numbers, CVV or UPI PIN was found. That does not audit the provider or browser extensions.
- Checkout intentionally sends contact prefill to Razorpay. WhatsApp checkout puts customer/order details into a `wa.me` query and opens WhatsApp; that URL can persist in browser history and is disclosed to the intended service. Notification services receive contact/order details by design. Review access/retention and transport for these integrations; such intended disclosures are not themselves evidence of an attacker leak.
- The earlier layout-only admin authorization concern remains unresolved at the HTTP/RSC level. Do not label it either a confirmed full-database leak or safe solely because the browser redirects.

## Evidence and next fixes

Executed `npx tsx security/data-payment-cart-probes.ts`: **14 focused checks plus 4 baseline probes passed**. They include both protection checks and assertions demonstrating vulnerable behavior; they are audit scripts, not a secure regression suite. `npm run typecheck` also passed.

Priority: verify customer ownership; trim tracking/delivery responses; expire/scope review credentials; reserve coupons; retain and reconcile payment mappings; verify capture; add checkout idempotency; reject inactive campuses; bound/canonicalize carts; add optional contact retention and forget controls. Production HTTP/RSC tests and Razorpay test-mode scenarios are still required before declaring the site safe.
