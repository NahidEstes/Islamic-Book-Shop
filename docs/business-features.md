# Business reports, coupons and catalog CSV

## Reports — `/admin/reports`

Owner and manager can view reports. The date range uses Asia/Dhaka calendar days. Book sales are recognized on delivery; received returns are recognized on their receipt date. Legacy records without these timestamps use creation dates and are flagged. Demo and cancelled orders are excluded. Collections and completed refunds follow their own event dates and remain separate from sales/profit. Current stock, customer receivables and supplier payables are independent of the selected period.

Purchase receipts add known inventory costs, including allocated invoice discounts and freight. Allocation conserves integer poisha across partial receipts. Known copies use a moving weighted average and are consumed before unpriced copies. Sale costs are saved on each order line, so future purchases or catalog price changes do not alter earlier margins. Cancellation restores allocated costs. Received, restocked returns recover their saved cost; damaged/non-restocked returns do not. Existing stock and historical sales with no cost record remain unknown. Preorder costs remain unknown because preorder quotas are separate from physical inventory.

The opening-stock form records cost only for currently unpriced physical copies, without changing old orders. The form rejects concurrent stock changes. Profit is unavailable when relevant sales/returns contain unknown costs. Known inventory value is explicitly partial when unpriced stock exists. The result includes book net sales, delivery charges, known costs and recorded expenses; unrecorded overheads and manual stock write-offs are not inferred. This is an operational report, not an audited financial statement.

Finance users can record dated packaging/courier/rent/other expenses, with exact minor-unit amounts and a unique reference. Mistakes are voided, retained and audited. CSV export includes the selected range, metrics, per-book records and expenses. Print uses the same selected report.

## Coupons — `/admin/coupons`

Owner/manager have the promotions permission. A coupon supports percentage or fixed whole-taka discounts, an optional cap, minimum book subtotal, inclusive start/end dates, a total usage limit, enable/disable, and selected books or the entire catalog. One coupon applies per order; delivery is excluded. Dates use Asia/Dhaka. Cancelled orders release usage; returned orders do not. Demo orders also consume usage so test checkout and its usage display remain consistent.

The quote endpoint changes no data. Checkout recalculates eligibility, prices and remaining uses inside the same transaction that reserves stock and creates the order. Line discounts sum exactly to the invoice discount. Returns/refunds are capped at discounted item value. Payment/refund records support two decimal places. Updating cart/prices/delivery invalidates an applied quote and requires reapplying or removing it. Codes are manually entered at checkout; creating a coupon does not publish a private code on the homepage.

## Catalog CSV — `/admin/books/import`

Catalog users can export, download a template, preview UTF-8 CSV, and commit a reviewed batch. Limits: 500 data rows / 500 KB. Commas, quoted newlines, doubled quotes and BOMs are supported. A malformed or invalid batch writes nothing. Preview does not mutate the catalog. Commit checks the current catalog fingerprint and requires a UUID for retry-safe imports.

Leave `id` blank to create; supply an exported existing ID to update. Matching is by ID, not by title/ISBN. Updates preserve omitted columns, media/preview permissions and preorder settings. Supplied `stock` replaces current stock and is audited; purchased copies should instead be received through Inventory. Known stock costs cannot be overwritten through CSV. Additional stock is unpriced; reduced stock removes the corresponding cost pool. The import preview shows create/update, price, stock and row errors. Export excludes private cost pools and prefixes spreadsheet-formula cells with an apostrophe for safety. Such escaped text should be reviewed before re-import. Tags and contents use `|` separators.

New books require `slug,title,author,publisher,category,price,originalPrice,description`. Optional columns: `id,stock,pages,language,edition,binding,featured,coverTheme,isbn,publicationYear,lowStockThreshold,subtitle,translator,editor,tags,contents,sample`. Prices/stock/pages/year use whole numbers. Booleans use `true`/`false`. Supported categories and cover themes appear in the column guide. A new book defaults to zero stock, Bengali, first edition, paperback, sage cover and not featured; the template is explicitly sample data.

## Storefront

The forest/ivory/gold refresh covers home shelves, cards, product details, cart and checkout. Search suggestions use real catalog titles/authors/ISBN. Catalog filters support minimum/maximum prices and discounted books, with bookmarkable 12-book pagination. Homepage shelves use actual catalog entries, prices and availability. Existing preview permissions, guest checkout, preorder terms and account flows are retained.

Verification uses isolated file-backed API data and an isolated MongoDB replica set. No live orders, coupon codes, expenses or imported sample books are added by these tests.
