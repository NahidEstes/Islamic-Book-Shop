# Verification — commerce upgrade

Validated on Windows with Node.js 24 and npm 11, 22 October 2026.

## Automated checks

- `npm run typecheck`: passed.
- `npm test`: **24 tests passed**, with separate temporary stores. Covers existing catalog/cart/order behavior, guest privacy, hashed sessions and expiry, account ownership, addresses, current-price reordering, staff permissions and session revocation, single-use identity links, verified-review eligibility/moderation, upload validation and publication permissions, collection ordering, restock deduplication, email outbox leases/retries, preorder capacity/terms/shipment/cancellation, returns, payment/refund limits, audit records and legacy migration.
- The reader component test exercises opening, page navigation, zoom, closing and reopening, including releasing the document scroll lock.
- `npm run test:mongo`: **1 integration test passed** against an isolated, real temporary MongoDB replica set. Exercises persistence, sessions, simultaneous stock reservations, cancellation/restocking and role enforcement. It does not use the owner's database.
- `npm run build`: production compilation and page generation passed.

## Browser and visual checks

- Existing storefront checks from the base implementation covered search, wishlist/cart, guest checkout, order lookup and product editing.
- This upgrade verified registration, a saved address, a restock subscription, and the original PDF sample loading, changing page and zooming.
- Collections and product detail render with the new controls. A narrow product layout was inspected without horizontal document overflow.
- Later browser automation inputs stopped producing effects across unrelated controls. The final reader lifecycle change is covered by the component test, but a complete browser rerun of the final reader, advanced admin forms and all account actions remains outstanding. These flows have API/domain coverage; this document does not claim complete browser acceptance testing.
- Local QA records include a fictitious reader/address, a subscription and a clearly labelled original two-page preview fixture. The existing demo catalog and historical orders were retained. Tests do not send external email or transfer money.

## Connections and remaining launch setup

- Local preview uses JSON demo storage; no owner-supplied MongoDB URI is configured. The temporary replica-set test is separate from deployment verification.
- SMTP is not configured. In-app notices work; email recovery, verification and email notifications are explicitly unavailable until configured.
- Finance supports manual collection/refund records with reconciliation checks. No payment gateway, courier or SMS provider is connected; refund records do not execute transfers.
- The catalog, contact information and business policies are sample content. Supply actual book metadata, stock, authorized cover/sample files and finalized policies before launch.
- Production requires a MongoDB replica set, HTTPS app origin and durable uploads directory. No hosting deployment was performed. The sample storefront remains `noindex`.

See the project README for setup, roles, media permissions, preorder shipment rules and storage limitations.
