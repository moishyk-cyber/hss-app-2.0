# HSS Kitchens App — Data Model (Draft v1)

Standalone web app replacing the monday.com CRM/Order/Purchasing system. Users: sales, purchasing, billing — everyone at HSS. Own database; monday is only a one-time migration source.

Design source: monday workspace 13185419 schema (pulled 2026-08-18), Scope & Proposal doc (May 19 2026), Roadmap doc (through Week 6), Sales Process 2.0 form spec.

## Design decisions (fixes vs. the monday build)

1. **One line-items table, not two.** Roadmap: "Each order item in the sales process stays an order item in the ordering process." In monday this required two boards (Sales - Line Items, Orders - Line Items) and manual carry-over. Here a single `line_items` row lives through both phases — RFQ fields for sales, fulfillment fields for ordering. No copying, no drift.
2. **Purchase orders are a first-class entity.** The fulfillment steps (submit PO → acknowledgment → tracking → delivery) are per-vendor, not per-order. monday had no PO object at all (the "Purchase - Orders" relation actually pointed back at Orders). `purchase_orders` groups line items by supplier per order.
3. **Suppliers/vendors are companies.** monday mixed customer and vendor types on the Business board — keep that (single `companies` table with a type), since contacts, addresses, and phones are identical. Purchasing-specific fields live in a nullable `supplier_profile`.
4. **Intake form writes directly to real records.** monday needed a staging "Sales - Opportunities Form" board + Make.com scenario to route submissions. The app's intake form creates the company/contact/opportunity-or-order + items in one transaction. Raw submissions are still archived in `intake_submissions` for audit.
5. **Clean status enums, one per phase** — no more deal-status labels copied onto the Orders board. Pipelines below.
6. **Explicit payments.** Proposal requires deposit (projects) / full payment (orders) before POs go out, plus a QuickBooks invoice #. Modeled as `payments` rows on an order, so "Step 1 - Payment" is enforceable.
7. **Tasks link polymorphically** (order, opportunity, company, or contact) — fixes the mislabeled relations on the monday Tasks board.
8. **Locations are rows, not free text** (Sep 3 2026). A `locations` row per physical site of a business; deals and orders point at one (`location_id`). The free-text `location_name` / `delivery_address` on opportunities and orders STAY as the snapshot actually used for delivery - picking a location copies its name/address into them, so an edited location never silently changes an in-flight order.
9. **Deliveries are their own entity** (Sep 3 2026). One `deliveries` row per delivery leg; default one per PO (created with it), splittable (items move whole). The PO's old logistics columns (trucker, pickup, scheduled date, cost, charged-to-customer, contact phone, delivery status, tracking) were backfilled into deliveries and are deprecated on the PO. Order status and the complete guard read deliveries, never `purchase_orders.delivery_status`.
10. **Terms drive the invoices** (Sep 3 2026). `orders.payment_terms` (PAYMENT_TERMS) is set at close / intake; `applyTermsToOrder` writes `deposit_required` and creates the `source = terms` payments (deposit + balance, full upfront, full on delivery / net 30, or nothing for custom without a deposit). Manually added invoices are `source = manual` and are never touched by re-applying terms; paid payments are never touched either.
    - **Superseded Sep 4 2026** (Moishy): terms are one free-text box on the order (`orders.terms_notes`) and the app never auto-creates invoices - invoices are added by hand on the Invoice tab. `payment_terms` / `deposit_required` stay on legacy rows only; the payment gate falls back to `companies.requires_deposit` / `deposit_percent`.
11. **Quotes are a status on the order, not a document type** (Sep 3 2026). `orders.quote_status` (not_needed | needed | sent | accepted) plus a `quote_url`; projects start at `needed`, straight orders at `not_needed`. The quote file itself is a `documents` row of kind `quote`.
12. **Ball-in-court is derived, never stored** (Sep 3 2026). `src/lib/ballInCourt.ts` computes the single next step (sales → pricing → close → quote → terms → deposit → POs → delivery → customer service) and the team that holds it from stage, item RFQ statuses, quote status, terms, the payment gate, POs, deliveries and open service issues. No column; it can never drift from the facts.
13. **Permissions are per role with overrides** (Sep 3 2026). The shipped matrix lives in `src/lib/permissions.ts`; `role_permissions` stores only the cells an admin flipped (missing row = default, same pattern as `field_requirements`). Identity is still the sidebar picker, so this is workflow guidance, not security.

## Entities

### users
App logins. `id, name, email, role (admin | sales | purchasing | billing | viewer), active`

### companies
Accounts — customers AND vendors/suppliers/installers.
`id, name, type (lead | customer | lost_lead | vendor | supplier | installer | delivery_partner), vertical (restaurant | supermarket | healthcare | venue_catering | school | shul | hotel | other), priority_client (bool — repeat clients get priority ordering), phone, phone_ext, cell_phone, email, delivery_address, billing_address, location_name, zip, website, notes, created_at`
(Type list = Week 2 roadmap list; vertical list = "Who We Serve" page. Multi-location clients (e.g. Nutmeg Deli): keep one company row, per-order delivery address + location_name covers the locations — revisit if they want location-level reporting.)

### locations
A physical site of a business (multi-location customers: one company row, many locations).
`id, company_id, name, address, delivery_notes, contact_name, contact_phone, is_default (bool), created_at`
Backfilled once from `companies.location_name` / `delivery_address` (one default location per company that had either).

### supplier_profile (1:1 optional on companies)
`company_id, account_number, default_lead_time_days, rep_notes, preferred (bool)`

### contacts
`id, company_id, first_name, last_name, title (manager | purchasing | billing | other), email, phone, phone_ext, cell_phone, status (active | onboarding | inactive), notes, created_at`

### opportunities
Deals pipeline; carries all Project intake detail.
`id, company_id, primary_contact_id, salesperson_id (users), stage, order_type (project | order), needs_pricing (bool), value, needed_by_date, est_due_date, next_follow_up, lost_reason (required when stage=lost),`
Project fields: `facility_type, menu, room_dimensions, wall_measurements, plumbing_electrical_notes, budget, client_vision_notes, delivery_type (curbside | inside), opening_size, installation_needed (bool), design_status (none | rendering_in_progress | rendering_approved), location_name, delivery_address`
`location_id (locations, nullable - see decision 8), created_at, submitted_via (form | manual)`
(Assessment fields per the "What We Do" process: space, measurements, plumbing, electrical, budget, vision. `design_status` covers Sean's 3D-rendering/approval step on Projects.)

**Stage enum:** `new → info_missing → estimating → proposal_sent → revisions_needed → negotiation → won | lost`
(Merge of proposal-doc pipeline and the live board groups — confirm with client.)

### line_items
One row per item, sales → fulfillment, same row throughout.
`id, opportunity_id (nullable), order_id (nullable), po_id (nullable), delivery_id (nullable - the leg this item travels on), name, description, more_details, image, qty, item_kind (sourced | custom_fabrication | service), brand, sku, supplier_id (companies, null for custom fab), unit_cost, unit_price, gross_profit (computed), lead_time_days,`
(`item_kind`: HSS does custom stainless fabrication when no standard appliance fits — those items have no supplier/SKU and their own lead-time reality. There is no brand catalog to import; items are free-form and vendor-quoted.)
**RFQ status:** `needs_pricing → rfq_sent → quote_received → priced_in_autoquotes → approved` | `removed` (removed items filtered from views, never deleted)
**Delivery status:** `pending → ordered → in_transit_to_hss | in_transit_to_client → arrived_complete`
`date_ordered, date_arrived_hss, date_arrived_client, tracking_url, assignee_id, next_follow_up, followed_up (bool), files, notes`

### orders
Created when an opportunity is Won, or directly from a simple no-pricing intake.
`id, opportunity_id (nullable), company_id, contact_id, owner_id (users), order_type (project | order), status, po_number_client, job_id, quickbooks_invoice_no, order_value, deposit_required, location_id (locations, nullable), delivery_address, needed_by_date, next_follow_up, files, created_at`
Terms + quote (decisions 10, 11): `payment_terms (deposit_balance | full_upfront | on_delivery | net_30 | custom), terms_notes, quote_status (not_needed | needed | sent | accepted), quote_url, quote_sent_at`
(The manual `urgency` field standard/same_day/emergency was removed - the client's call: "remove all the urgency, and we'll just filter it by due date." Every surface that used to sort/highlight on urgency now uses `needed_by_date` instead.)

**Status enum (fulfillment, per roadmap steps 1–6):**
`new → awaiting_payment → payment_received → pos_in_progress → in_transit → delivery_scheduled → delivered → complete` | `stuck`

### purchase_orders
Per supplier per order.
`id, order_id, supplier_id, po_number, auto_quotes_po_number, status, sent_date, ack_date, files, notes`
**Status enum:** `draft → sent → acknowledged → shipped → received` (ship-to on the PO: `hss | client_direct`, derived from its delivery's mode)
A PO is vendor + AutoQuotes PO # + items only. **Acknowledged is the hinge**: the vendor has
confirmed, so that step picks the delivery mode and creates the `deliveries` row (Sep 8 2026
client call). Nothing about how the goods travel lives on the PO itself.
Deprecated (backfilled into `deliveries`, dropped from the schema in a later pass; DB columns kept): `tracking_url, tracking_carrier, expected_delivery, trucker, pickup_address, scheduled_delivery_date, ship_cost, charged_to_customer, delivery_contact_phone, delivery_status`.

### deliveries
One delivery leg (decision 9). Created when its PO is acknowledged - default one per PO,
splittable; HSS-stock deliveries have no PO.
`id, order_id, purchase_order_id (nullable), mode (manufacturer_to_customer | hss_to_customer | manufacturer_to_hss_to_customer), status (pending | scheduled | in_transit | delivered_partial | delivered_full),`
Leg 1 (manufacturer shipment, modes manufacturer_*): `tracking_carrier, tracking_url, expected_delivery`
Leg 2 (HSS trucker to the customer, modes *_to_customer via HSS): `trucker, pickup_address, scheduled_delivery_date, ship_cost, charged_to_customer (bool), delivery_contact_phone`
`delivered_at, notes, created_at`. Items point at their leg via `line_items.delivery_id`.

### payments
`id, order_id, type (deposit | final | full), amount, status (pending | invoiced | paid), quickbooks_ref, date, source (manual | terms), due_note, notes`
Rule: projects require a deposit payment before POs; simple orders require full payment. `source = terms` rows are generated by the order's payment terms (decision 10); `due_note` is the human wording ("Balance due before delivery").

### tasks
`id, title, notes, assignee_id, due_date, status (not_started | in_progress | done | stuck), priority (low | medium | high | critical), type (internal | customer_service | external), estimated_hours, linked_type (opportunity | order | company | contact | null), linked_id, created_at`
Subtasks: `parent_task_id` self-reference.

### intake_submissions
Raw archive of every form submission (payload JSON, submitted_at, processed → links to created records). Replaces the Form board's Incoming/Processed groups.

### documents
`id, linked_type, linked_id, kind (quote | invoice | drawing | po | tracking | other), file_url, file_name, source (link | upload | google_drive), mime_type, size_bytes, storage_path (Supabase Storage object path for uploads), uploaded_by, note, uploaded_at`
(Replaces the empty Quotes & Invoices board - quotes stay authored in AutoQuotes, stored/linked here. Google Drive files are pasted share links.)

### service_issues
Customer-service log. Hangs off whichever of company / location / order / line item is known.
`id, company_id, location_id, order_id, line_item_id (all nullable), title, description, status (open | in_progress | resolved | closed), priority (low | medium | high | critical), assignee_id (users), reported_at, resolved_at, resolution, created_at`

### role_permissions
Per-role override of the shipped permission matrix (decision 13). `id, role, permission, allowed` - unique on (role, permission); a missing row means the shipped default.

### app_settings
Key/value settings: `key (pk), value, updated_at`. Typed keys in `src/lib/settings.ts` (company details for PO PDFs, default service assignee, PO PDF footer).

### activity_log
`id, user_id, linked_type, linked_id, action, detail, at` — audit trail across all records.

## The flow

1. **Intake** (sales fills form): existing client → pick company; new → inline company+contact fields. Order Type branch: **Project** (facility/menu/dimensions/delivery/installation/drawings) or **Order** (skip straight to items + needs-pricing question). Items: name, details, image, add-more. "When do you need it?"
2. **Routing (automatic):** needs pricing → creates opportunity + line_items (RFQ phase). No pricing needed → creates order + line_items directly (skip sales phase).
3. **Estimating (purchasing + sales):** RFQ queue = all items `needs_pricing`. Items go to suppliers, prices come back, entered in AutoQuotes, marked approved. Opportunity advances to proposal_sent.
4. **Close:** Won → order auto-created, items re-pointed at order (same rows). Lost → lost_reason required.
5. **Fulfillment (purchasing/billing):** payment gate → build POs by supplier → send → acknowledgment → tracking → delivery-day check-in → complete.
6. **Tasks** attach anywhere; customer-service tasks link to orders.

## Company research notes (Aug 18 2026, hsskitchens.com + directories)

HSS Kitchen Equipment Inc, Brooklyn NY (Atlantic Ave warehouse + Boro Park office), in business since 1992, ~5–9 people, est. $1–5M revenue. Family operation: Herman Freund (sales), Sam Freund (project manager), Mrs. Perl (accounting), Sean Henderson (in-house 3D designer). Full-lifecycle outfitter: assess → design (3D renderings) → source → deliver/install → inspect + ongoing support; also custom stainless fabrication. Customers: restaurants, supermarkets, healthcare, venues/catering, schools, shuls, hotels — strong NY kosher-community base, some multi-state. No e-commerce, no brand catalog; sales are phone/email/consultative (orders@hsskitchens.com), same-day delivery and 24-hr emergency support are differentiators. Hours Mon–Thu 9–6, Fri 9–2. No financing/leasing/used/parts programs visible.

Likely initial users: Herman + any salespeople (sales), Sam (purchasing/PM), Mrs. Perl (billing), Sean (design — viewer/design role on Projects).

## Open questions (from roadmap "Open items" + new ones)

- Confirm opportunity stage list and order status list wording with client.
- Installation: order-level or per-item? (roadmap open item — modeled order-level for now, easy to move)
- Task assignment rules — who gets what type?
- Naming convention for orders/jobs (job_id format?)
- Item rating / customer satisfaction for reporting — later phase?
- Migration: import companies (48), contacts (4), opportunities (15), line items (22+4), orders (6) from monday via API.
