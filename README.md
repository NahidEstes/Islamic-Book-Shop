# নূর বুকশপ

Bengali Islamic bookstore built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, Express, MongoDB/Mongoose, Zod, PDF.js, Sharp and Nodemailer. The existing green, ivory and gold storefront, wishlist, cart, guest checkout and order tracking are preserved.

## Local development

Use Node.js **22.13+**, preferably Node.js 24 LTS. Development and verification used Node.js 24.

```powershell
npm install
# Only if this file does not already exist:
Copy-Item .env.example .env.local
npm run dev
```

- Store: http://localhost:3000
- Customer account: http://localhost:3000/account
- Editorial collections: http://localhost:3000/collections
- Admin: http://localhost:3000/admin
- Profit & business reports: http://localhost:3000/admin/reports
- Coupons & offers: http://localhost:3000/admin/coupons
- Book CSV import/export: http://localhost:3000/admin/books/import
- API health: http://localhost:3000/api/health

`npm run dev` starts Next.js and Express together. `/api/*` is proxied to the private API through Next.js. `npm run dev:web` and `npm run dev:api` can run the processes separately. PDF workers, fonts, CMaps, colour profiles and WASM resources are copied from the installed PDF.js package by `postinstall`, `predev` and `prebuild`; no external PDF CDN is used.

## Implemented features

The storefront now includes live search suggestions, price/discount filters, pagination, refreshed book/product/cart/checkout surfaces and server-validated coupon checkout. Reports include sale-time cost snapshots, inventory valuation, customer/supplier balances, dated expenses, CSV export and print. Catalog CSV has a validation preview, atomic commit and stale-preview protection. See [business feature behavior and import rules](docs/business-features.md).

### Catalog, cover images and preview reader

Admin → **বই ও প্রিভিউ** supports title/subtitle, author, translator, editor, publisher, ISBN, publication year, language, edition, binding, pages, subject tags, prices and stock. Optional metadata may remain blank; sample records are explicitly marked.

Save a new book before uploading files. Upload a cover, additional images and either one sample PDF or ordered page images. Set the permission checkbox and record the permission reference before publishing a preview. Reordering or removing page references takes effect when the book is saved.

Only JPEG, PNG, WebP and preview PDFs are accepted, up to 10 MB per upload. Images are decoded and re-encoded as WebP without embedded metadata. PDFs must parse, be unencrypted and have at most 30 pages. Published samples must be shorter than the declared book. Preview files are not public unless attached to a book with confirmed permission. Unattached images and drafts are also private. An unused asset may be deleted through the authenticated media API after unlinking it from all books/collections.

The “একটু পড়ে দেখুন” reader supports PDF/image previews, page navigation, zoom, keyboard focus, loading/error states and narrow layouts. Only authorized sample material should be uploaded; this feature does not obtain publication rights.

The local demo may contain **নূর বুকশপ — নমুনা পাঠ**, a clearly labelled, self-authored reader test with two original English pages. It is not an excerpt from a published book. Real covers, ISBNs, authors, editions and inventory must be supplied by the store owner.

### Customer accounts

Registration, login/logout, profile editing, saved addresses, order history, current-price reordering, in-app notifications and return requests are available at `/account`. Guest checkout remains available.

Passwords use asynchronous scrypt with per-user salts. Session tokens are stored only as hashes; browsers receive an HttpOnly, SameSite=Lax cookie. Production cookies are Secure. Sessions expire after seven days and are revoked after password or staff-permission changes. Unsafe browser requests are checked against `PUBLIC_APP_URL` and cross-site fetch metadata.

An authenticated checkout attaches the order to that account. Existing guest orders are **not** claimed by matching an unverified phone number. Guest order tracking continues to require the order number and matching phone. No guest-order claiming flow is implemented.

Password recovery and email verification use expiring, single-use, hashed tokens and require SMTP. Without SMTP, the interface explicitly reports recovery/verification as unavailable. Password changes and successful recovery revoke existing sessions.

### Verified reviews and editorial collections

A review requires a delivered, non-demo purchase of that book owned by the account. Each customer can have one review per product. New or edited reviews are pending until an authorized moderator approves them. Public averages/counts use approved reviews only; no ratings or testimonials are fabricated.

Admin → **নির্বাচিত সংগ্রহ** creates collections with a slug, description, editorial reason, optional image and manually ordered books. Collections can be published/unpublished and featured on the homepage. Initial collections are marked by their descriptions as sample editorial selections, not religious endorsements.

### Stock notifications and preorders

Unavailable books offer an authenticated stock-alert subscription. A zero-to-positive restock creates an in-app notice once per active subscriber and restock event. Subsequent positive stock edits do not duplicate that event. Email notices require both a verified email and SMTP.

Preorders have a separate price, capacity, reserved count, estimated publication/dispatch dates and cancellation terms. Existing reserved quantities cannot be reset by editing a product. Checkout requires accepting the preorder policy. **Mixed carts ship together once all books are ready, with one delivery charge**. Estimated dates are shown before checkout and date changes create customer notices.

Admin → **অর্ডার ও প্রি-অর্ডার** must mark all preorder books ready before shipping. Normal stock never becomes negative to represent preorder reservations. Available normal stock is separate from the copies allocated to preorders. A pending/confirmed unpaid cancellation restores each appropriate stock/quota once.

### Returns, payment records and staff permissions

Delivered orders can receive item/quantity return requests from their owning account. Admins approve/reject them and record receipt. Restock occurs only when explicitly selected on receipt, once per return. Customers can see their return and refund statuses.

Finance records **actual manual collections/refunds**; it does not collect or transfer money. Recording a collection requires an explicit confirmation and unique receipt/reference. Collections cannot exceed the balance. Refund reservations cannot exceed collected funds or the returned items' value. Shipping charges are not automatically refundable. Pending refunds require confirmation of an actual manual refund and a unique reference before being marked completed. Demo orders cannot receive real payment/refund records.

Reports distinguish demo/cancelled orders, ordered totals, delivered totals, collected money, confirmed refunds, net collections and unpaid COD. Date filters apply to order dates for order metrics and event dates for payments/refunds. Low-stock thresholds are configurable per book. Important administrative changes are audited.

| Role | Permissions |
| --- | --- |
| Owner | All features, staff creation and permission changes |
| Manager | Catalog, collections, orders, review moderation, returns, finance, reports, audit, outbox |
| Catalog editor | Catalog/media and editorial collections |
| Order operator | Orders/preorder readiness and returns |
| Customer | Their own profile, addresses, orders, eligible reviews, alerts and returns |

Permissions are enforced by the API. Changing a staff role revokes that person's sessions. The last active owner account cannot be disabled or demoted.

## Owner setup

Use the existing private `ADMIN_API_KEY` in `.env.local` to open the initial owner panel. It remains in tab memory and is never saved in local storage. Create an owner/staff account through **কর্মী ও অনুমতি**, then sign in at `/account`; authorized users can open `/admin` using their session. Once an owner account is working, the bootstrap key can be removed from deployment configuration if desired. Do not put it in `NEXT_PUBLIC_*` or commit it.

## Storage, migration and production

### Database-free Vercel demo

Set `VERCEL_DEMO_MODE=true` and keep `DEMO_MODE=true` (or unset) before rebuilding/redeploying. The Next.js `/api/*` handler serves the clearly labelled sample catalog and collections without Express, MongoDB or server file storage. Search, filters, wishlist and cart work. Real account registration, coupon checkout and order saving remain disabled; no successful saved order is fabricated.

Open `/admin` and select **টেস্ট অ্যাডমিনে প্রবেশ করুন** to test the A-design book catalog without a password or owner key. Add/edit books, prices (৳), stock, cover/gallery images and permitted preview images/PDFs. Save a new book before uploading files, then save again to attach them. The edited catalog also appears on the storefront in that browser. Only the catalog section is available; real staff, inventory purchases, orders and finance are not enabled by this test entry.

Changes and uploaded files live in **IndexedDB in that browser, for that exact site origin**, including across reloads. Other browsers, devices, private sessions and deployment-specific URLs have separate data. They are temporary test data, not a backup: browser eviction, clearing site data, closing a private session or confirming **ডেমো ডেটা Reset** removes them. Reset restores the ten seed books and removes uploaded demo files. Signing out closes that tab's demo admin access but keeps its test catalog. The server API stays read-only and serves its seeds; the browser adapter never bypasses real API authentication. Existing local Express admin data/uploads are not copied to Vercel. To change the initial samples for every visitor, edit `seedProducts` in `lib/catalog.ts` and redeploy.

Without an explicit `VERCEL_DEMO_MODE`, this demo is enabled automatically only on Vercel when `DEMO_MODE` is not `false`, MongoDB is absent and the API URL is absent or loopback. A configured external API or MongoDB disables automatic fallback. `VERCEL_DEMO_MODE=false` disables it explicitly. `DEMO_MODE=false` always prevents the sample fallback, including a conflicting `VERCEL_DEMO_MODE=true` setting. Normal local development keeps the existing Express-backed demo. Switching between the embedded demo and the external API requires rebuilding because rewrites are generated at build time.

This mode tests the storefront and book editor using temporary browser data. Shared, durable admin data still needs the API/database/media setup below.

With no MongoDB URI and `DEMO_MODE=true`, local data persists in `work/data/store.json`; uploaded media defaults to `work/uploads`. This file backend is single-process development storage. Tests use separate temporary stores and do not overwrite the demo store.

Older product/order records receive backward-compatible defaults on reads and persist with the next mutation. Existing IDs, prices, stock and historical guest orders are retained. No customer is automatically assigned ownership of an older guest order.

For MongoDB, set `MONGODB_URI` to an Atlas or other replica-set connection and restart the API. `npm run seed` inserts missing sample books without overwriting existing books. Transactions cover related account, inventory, notification, return and finance changes. A revision gate serializes mutations across API processes; this implementation currently assembles the store state for these transactions. High-volume deployments should move reads and mutations to indexed aggregate-specific queries while preserving the same consistency rules.

Production startup requires:

- A MongoDB replica set.
- An HTTPS `PUBLIC_APP_URL` matching the browser origin.
- An absolute `UPLOAD_DIR` on a durable volume, backed up together with the database.
- Real catalog information, authorized artwork/previews and finalized business contacts/policies.

Set `DEMO_MODE=false` only when ready for real COD orders. Production refuses the local JSON fallback. No paid services or hosting deployment were activated.

## Optional email delivery

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. Typically use port 587 with `SMTP_SECURE=false` (STARTTLS required), or 465 with `SMTP_SECURE=true`. Keep credentials private. Restart the API after changing environment variables.

The API processes the durable outbox every 30 seconds. Transient failures use backoff with up to five attempts; administrators can requeue an eligible failed message. Leases prevent simultaneous worker delivery of one message. Delivery is at-least-once across a crash after SMTP acceptance, with a stable Message-ID. “Accepted by email service” is not a guarantee of inbox delivery. Expired identity emails cannot be retried, and their secret links are removed after acceptance/expiry. Outbox administration does not expose recipients or token-bearing message bodies.

Without SMTP, in-app notices still work and email notices remain explicitly unavailable. No external test emails were sent during verification.

## Checks and commands

```powershell
npm run typecheck
npm test
npm run test:mongo
npm run build
npm start
```

`npm test` covers the file-backed API/domain behavior. `npm run test:mongo` starts an isolated temporary MongoDB replica set using `mongodb-memory-server`; the first run may download a MongoDB binary. It does not connect to or alter the configured store database. `npm start` requires the production settings described above.

External payment gateways, courier/SMS services and the owner's real MongoDB/SMTP accounts are not connected. Refunds are manual records, not gateway execution. Business contact details and final selling/return policies remain owner-supplied.

## Source map

`app/`: pages and styles; `components/`: customer/admin interfaces; `lib/`: shared models and validation; `server/`: API, authentication, commerce, media, outbox and storage; `tests/`: isolated tests; `public/`: local fonts/artwork and generated PDF.js resources.

Font licenses are included in `public/fonts/OFL.txt`; original generated artwork provenance is in `docs/assets.md`.
