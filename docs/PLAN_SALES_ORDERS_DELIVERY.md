# HSS Kitchens — Sales → Orders → Delivery → Service build plan (Sep 3 2026)

Planned by Fable. Executed by sub-agents (Fable for the foundation, Opus for the
complex UI surfaces, Sonnet for the rest). Branch: `claude/sales-orders-delivery-workflow-hxtsxl`.

Every decision below is final for this pass. Agents build to this spec; they do not
re-litigate it. Where the spec is silent, follow the existing codebase conventions
(see "House rules").

---

## 0. House rules (every agent)

- Read `AGENTS.md` first: this Next.js differs from training data; consult
  `node_modules/next/dist/docs/` before writing routing/server-action code.
- Enums are strings, vocabularies live ONLY in `src/lib/constants.ts` (or a module-local
  `_ui.ts`/`utils.tsx` when truly module-local). `isValidValue()` before persisting.
- Every write is a server action returning `ActionResult` via `safeAction`, logs via
  `logActivity`, and revalidates every surface the change is visible on.
- Order status / payment gate rules live ONLY in `src/lib/flow.ts`. Call
  `recomputeOrderStatus(orderId)` after any mutation of payments / POs / deliveries / items.
- Money through `roundCents`. Dates through `@/lib/dates` (deterministic UTC).
- No em-dashes in UI copy or comments (use a plain hyphen). No bare `—` empty states:
  use `.empty-value` phrases ("not set", "unassigned").
- Design language unchanged: `.card`, `.btn`, `.badge-*`, `.table-klyne`, `BadgeSelect`,
  `ActionButton`, `PendingButton`, `ConfirmDialog`, `useToast`. Match neighbouring code.
- Validation an agent must run before reporting done:
  `npx prisma generate && npx tsc --noEmit && npx eslint <files you touched>`.
  There is NO database in this environment (no `DATABASE_URL`); never try to run
  `prisma db push`/`migrate`. Schema changes ship as SQL in `prisma/sql/` and are applied
  to Supabase by the orchestrator.
- Several agents work concurrently in the SAME working tree. Do NOT run `git commit`,
  `git stash`, `git checkout`, or reformat files you don't own. If `tsc` fails inside a
  file you don't own, re-run a minute later; report it if it persists. Keep edits to
  shared files (order detail page, actions files, constants) small and localized.
- Do not touch `next.config.ts`, `package.json` (except the agent explicitly told to add
  a dependency), or `prisma/schema.prisma` unless your task says so.

---

## 1. Data model changes (Phase 1, Fable)

### New tables

**Location** - a physical site belonging to a business. Deals and orders point at one.
```
Location { id, companyId (FK Company, required), name, address, deliveryNotes?, contactName?,
           contactPhone?, isDefault Boolean @default(false), createdAt }
@@index([companyId])
```
Company gets `locations Location[]`. Opportunity and Order get `locationId String?` +
`location Location?` (@@index). The existing free-text `locationName` / `deliveryAddress`
on Opportunity and Order STAY as the snapshot actually used for delivery; picking a
location copies its name/address into them.

**Delivery** - one delivery leg. Default: one PO → one delivery. Splittable.
```
Delivery { id, orderId (FK, required), purchaseOrderId? (FK PurchaseOrder),
  mode String @default("manufacturer_to_hss_to_customer")
     // manufacturer_to_customer | hss_to_customer | manufacturer_to_hss_to_customer
  status String @default("pending") // pending | scheduled | in_transit | delivered_partial | delivered_full
  // Leg 1 - manufacturer shipment (modes 1 and 3): carrier tracking + ETA
  trackingCarrier?, trackingUrl?, expectedDelivery DateTime?
  // Leg 2 - HSS trucker to customer (modes 2 and 3)
  trucker?, pickupAddress?, scheduledDeliveryDate DateTime?, shipCost Float?,
  chargedToCustomer Boolean @default(false), deliveryContactPhone?
  deliveredAt DateTime?, notes?, createdAt
  lineItems LineItem[] }
@@index([orderId]) @@index([purchaseOrderId]) @@index([status])
```
LineItem gets `deliveryId String?` + `delivery Delivery?` (@@index).
PurchaseOrder gets `deliveries Delivery[]` and `autoQuotesPoNumber String?`.
The PO's own logistics columns (`trucker, pickupAddress, scheduledDeliveryDate, shipCost,
chargedToCustomer, deliveryContactPhone, deliveryStatus, trackingUrl, trackingCarrier,
expectedDelivery`) are backfilled into one Delivery per PO by the migration. They stay in
the Prisma schema through Phase 1 (marked `// DEPRECATED - moved to Delivery`) so the tree
keeps type-checking; the Deliveries agent (Phase 2a-B) removes them from the Prisma schema
once no code reads them. The DB columns are left in place (no destructive DDL this pass).

**ServiceIssue** - the customer-service log.
```
ServiceIssue { id, companyId?, locationId?, orderId?, lineItemId?,
  title, description?, status String @default("open") // open | in_progress | resolved | closed
  priority String @default("medium") // reuse TASK_PRIORITIES
  assigneeId? (FK User "IssueAssignee"), reportedAt DateTime @default(now()),
  resolvedAt?, resolution?, createdAt }
indexes on status, assigneeId, orderId, companyId
```
Relations added on Company, Location, Order, LineItem, User.

**RolePermission** - per-role override of the shipped permission matrix
(same pattern as FieldRequirement: missing row = shipped default).
```
RolePermission { id, role, permission, allowed Boolean; @@unique([role, permission]) }
```

**AppSetting** - key/value app settings (company details for PO PDFs, default service
assignee, etc.). `AppSetting { key String @id, value String, updatedAt }`.

### Column additions
- Order: `locationId?`, `paymentTerms String?` (see PAYMENT_TERMS), `termsNotes String?`,
  `quoteStatus String @default("not_needed")` // not_needed | needed | sent | accepted,
  `quoteUrl String?`, `quoteSentAt DateTime?`.
- Opportunity: `locationId?`.
- Payment: `source String @default("manual")` // manual | terms (auto-created from terms),
  `dueNote String?` (e.g. "Balance due before delivery").
- Document: `source String @default("link")` // link | upload | google_drive,
  `mimeType?`, `sizeBytes Int?`, `storagePath?` (Supabase Storage object path),
  `uploadedBy?`, `note?`.
- LineItem: `deliveryId?` (above). `leadTimeDays` already exists.

### Migration SQL (`prisma/sql/20260903_sales_orders_delivery.sql`)
Written by Phase 1, applied by the orchestrator through the Supabase MCP
(`apply_migration`, project `lnlunepyvjpgyaeolpxz`). Must be idempotent
(`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Contents, in order:
1. CREATE TABLE Location, Delivery, ServiceIssue, RolePermission, AppSetting (+ indexes, FKs,
   `ENABLE ROW LEVEL SECURITY` on each - every table in this DB has RLS on).
2. ALTER TABLE column adds listed above (with defaults).
3. Backfill Locations: one per Company that has `locationName` or `deliveryAddress`
   (name = locationName or 'Main location', address = deliveryAddress or billingAddress,
   isDefault = true). Link Opportunity/Order rows to it where their deliveryAddress equals
   the company's deliveryAddress (or is null).
4. Backfill Deliveries: one per PurchaseOrder copying its logistics columns; mode =
   `manufacturer_to_customer` when shipTo = 'client_direct', else
   `manufacturer_to_hss_to_customer`; status = old deliveryStatus (pending/scheduled/
   delivered_partial/delivered_full); set LineItem.deliveryId for that PO's items.
5. Backfill Order.paymentTerms for existing orders so nothing old nags "terms missing":
   depositRequired = 0 → 'on_delivery'; orderType = 'order' → 'full_upfront';
   else 'deposit_balance'. quoteStatus stays 'not_needed' for existing orders.
6. Backfill Payment.source = 'terms' where notes look auto-generated ("generated on win",
   "agreed at close").

---

## 2. Shared libraries (Phase 1, Fable)

### `src/lib/constants.ts` additions
```
PAYMENT_TERMS: deposit_balance "Deposit now, balance before delivery" | full_upfront
  "Full payment before ordering" | on_delivery "Full payment on delivery" | net_30
  "Net 30 after delivery" | custom "Custom (see notes)"
DELIVERY_MODES: manufacturer_to_customer "Manufacturer → customer" | hss_to_customer
  "HSS pickup → customer" | manufacturer_to_hss_to_customer "Manufacturer → HSS → customer"
DELIVERY_STATUSES_LEG (name it DELIVERY_LEG_STATUSES): pending | scheduled | in_transit |
  delivered_partial | delivered_full  (+ DELIVERY_LEG_STATUS_COLORS)
QUOTE_STATUSES: not_needed | needed | sent | accepted (+ colors)
SERVICE_ISSUE_STATUSES: open | in_progress | resolved | closed (+ colors)
DOCUMENT_KINDS: quote | invoice | drawing | po | tracking | other
DOCUMENT_SOURCES: link | upload | google_drive
```
Use plain "->" only inside code identifiers; UI labels may use the arrow glyph "→" as
above (it is not an em-dash).

### `src/lib/ballInCourt.ts` (pure, server+client safe)
The nine-step full flow and who holds the ball at each step:
```
FLOW_STEPS = [
  { key:"sales",    label:"Sales",              court:"sales" },
  { key:"pricing",  label:"Pricing",            court:"office" },
  { key:"close",    label:"Close",              court:"sales" },
  { key:"quote",    label:"Quote",              court:"office" },
  { key:"terms",    label:"Sales Order + Terms",court:"sales" },
  { key:"deposit",  label:"Deposit",            court:"billing" },
  { key:"pos",      label:"POs",                court:"purchasing" },
  { key:"delivery", label:"Delivery",           court:"purchasing" },
  { key:"service",  label:"Customer Service",   court:"service" },
]
COURTS = { sales:"Sales", office:"Office", billing:"Billing", purchasing:"Purchasing",
           service:"Customer Service" }  + COURT_COLORS (badge classes)
```
Functions:
- `opportunityBall(opp)` where opp = { stage, lineItems:[{rfqStatus}], order?: OrderBallInput|null }
  → `{ step, court, hint }`:
  new/info_missing → sales ("Complete intake"); any live item needs_pricing/rfq_sent, or
  stage estimating → pricing ("Price N items"); proposal_sent/revisions_needed/negotiation
  or all priced → close ("Close the deal"); won → delegate to `orderBall(order)` (or
  step "close" with hint "Create the order" when no order); lost → `{ step:null,
  court:null, hint:"Lost" }`.
- `orderBall(order)` where order = FlowOrder & { quoteStatus, paymentTerms, lineItems
  with purchaseOrderId, deliveries:[{status}], openIssueCount, status }:
  status complete → done (`step:null, hint:"Complete"`); quoteStatus needed → quote
  ("Prepare quote"); quoteStatus sent → quote ("Awaiting quote approval");
  paymentTerms null → terms ("Set terms"); gate not open → deposit (gate.reason);
  any live item without a PO, or any PO in draft/sent/acknowledged → pos;
  any delivery not delivered_full, or any live item not arrived_complete → delivery;
  openIssueCount > 0 → service ("N open issues"); else service with hint
  "No open issues - mark complete".
- `fullFlowSteps(ballStep, { orderHref?, dealHref? })` → `FlowStep[]` for the existing
  `FlowStepper`: steps before the ball are done, the ball step is current (blocked when the
  step is deposit and the gate is closed), later steps upcoming. Sales-side steps link to
  the deal page and order-side steps to the order tabs (`#invoice`, `#purchase-orders`,
  `#delivery`, `#service`).
- `BallInCourtBadge({ ball })` in `src/lib/BallInCourtBadge.tsx` (server-renderable):
  a `.badge` in the court's color reading e.g. "Ball: Office · Pricing".

### `src/lib/terms.ts`
- `depositForTerms({ terms, value, depositPercent, agreedDeposit? })` → deposit amount.
- `applyTermsToOrder(tx, orderId, { terms, value, depositAmount, notes? })`:
  writes `paymentTerms`, `termsNotes`, `depositRequired` (deposit_balance → deposit
  amount, full_upfront → value, on_delivery/net_30 → 0, custom → agreedDeposit ?? 0), then
  deletes unpaid `source = "terms"` payments and creates the invoices:
  deposit_balance → deposit (status invoiced) + final balance (status pending, dueNote
  "Balance due before delivery"); full_upfront → full (invoiced); on_delivery/net_30 →
  full (pending, dueNote "Due on delivery" / "Net 30 after delivery"); custom → nothing
  unless agreedDeposit > 0 (then a deposit invoice). Paid payments are never touched.
  Logs one activity entry.

### `src/lib/permissions.ts` + `src/lib/permissionsServer.ts`
```
PERMISSIONS = [
  intake.create, deals.edit, deals.close, pricing.edit, quotes.edit, terms.edit,
  payments.edit, pos.edit, deliveries.edit, service.edit, service.assign,
  files.edit, phonebook.edit, tasks.edit, admin.manage
] each with a label + group.
DEFAULT_ROLE_PERMISSIONS: admin → all; sales → intake, deals, close, terms, files,
  phonebook, tasks, service.edit; purchasing → pricing, quotes, pos, deliveries, files,
  phonebook, tasks, service.*; billing → payments, terms, files, tasks; design → files,
  tasks, deals.edit; viewer → none.
```
Server: `getRolePermissions()` (shipped defaults + RolePermission overrides),
`currentUser()` (cookie identity → { id, name, role } | null), `can(permission)`,
`requirePermission(permission): Promise<ActionResult | null>` (null = allowed; the
ActionResult is the friendly denial). Identity is the sidebar "Working as" cookie, so this
is workflow guidance, not hard security - say so in a comment. No identity → treated as
`viewer`, EXCEPT that when there are zero rows in User the app is unusable, so an empty
identity still passes `admin.manage` (bootstrap).

### `src/lib/settings.ts`
`getSetting(key)`, `getSettings(keys)`, `setSetting(key, value)`; typed keys:
`company.name, company.address, company.phone, company.email, service.defaultAssigneeId,
po.pdfFooter`.

### `src/lib/flow.ts` changes
- `FLOW_ORDER_INCLUDE` adds `deliveries: true` and lineItems keep purchaseOrderId.
- `deriveOrderStatus`: "delivered" when all live items arrived OR (items empty and every
  delivery delivered_full); "delivery_scheduled" when any delivery scheduled;
  "in_transit" when any delivery in_transit, any PO shipped, or any item in_transit_*;
  otherwise as today. `canCompleteOrder` uses deliveries the same way. Do NOT read
  `po.deliveryStatus` any more.
- Export `orderBallInput(order)` helper if convenient for pages.

Phase 1 also updates `docs/DATA_MODEL.md` with the new entities and marks the plan's
decisions there.

---

## 3. Feature work (Phase 2)

Run order: **2a** = A1, B, E, F in parallel. **2b** (after 2a is merged) = C, D, A2 in
parallel. Each agent owns the files listed; touch other files only where the task says.

### A1. Locations + intake carry-through + close terms (Opus)
Owns: `src/app/companies/**` (Locations card, actions), `src/app/intake/**`,
`src/app/pipeline/ClosePanel.tsx`, `src/app/pipeline/actions.ts` (markOpportunityWon,
updateOpportunity), `src/app/pipeline/[id]/edit/**`, new `src/app/companies/LocationsCard.tsx`.
1. Company detail: "Locations" card - list, inline add (name, address, contact, phone), edit,
   set default, delete (confirm; refuse when referenced by a deal/order, offer to reassign).
2. Intake: after a business is picked (existing or new), a Location picker: its locations
   as chips/select + "Add location" inline (name + address). Picking fills the delivery
   address (still overridable). New business: the delivery address/location-name fields
   create the first Location. Persist `locationId` on the created opportunity/order.
3. Intake price once: per-item optional "Unit price" input, and a "Total price agreed"
   field. For orders that don't need pricing: items get `unitPrice`, `rfqStatus: approved`,
   order gets `orderValue` (typed total, else sum of items) - and a **Terms** select
   (PAYMENT_TERMS, default `full_upfront`), then `applyTermsToOrder` runs so the invoice
   exists the moment the order does. For pipeline items the total becomes
   `opportunity.value` (nullable) and per-item prices are saved with status
   `quote_received` when given (else needs_pricing).
4. Close panel never re-asks: show price / location + address / needed-by as a read-only
   summary prefilled from the deal, each with a small "change" link that reveals the input.
   Inputs only start visible when the value is missing. Add the Terms select (default
   from company: requiresDeposit ? deposit_balance : on_delivery) and deposit amount
   (prefilled %). Confirm dialog summarizes terms.
5. `markOpportunityWon`: copies `locationId`; calls `applyTermsToOrder` in the same
   transaction instead of hand-building the payment; sets `quoteStatus: "needed"` for
   projects and `"not_needed"` for straight orders. Keep every existing guard.
6. Opportunity edit form + order header: Location select (company's locations).
   Requires `setOrderLocation(orderId, locationId)` in `src/app/orders/actions.ts`
   (append at end of file only).

### B. Deliveries (Opus)
Owns: `src/app/deliveries/**`, `src/app/orders/[id]/DeliverySection.tsx`,
`src/app/orders/[id]/PurchaseOrdersSection.tsx` (shipped-dialog + tracking parts ONLY),
delivery/PO functions in `src/app/orders/actions.ts`, `prisma/schema.prisma` (removal
of the deprecated PO columns only), `src/lib/flow.ts` if needed.
1. Delivery tab rewrite: line items table (unchanged component) then "Deliveries" list -
   one row per Delivery: mode badge, PO #, items count, status BadgeSelect, key dates,
   trucker, tracking link. Click → modal with mode-aware form: mode select; leg-1 fields
   (carrier, tracking URL, ETA) when mode is manufacturer_*; leg-2 fields (trucker,
   pickup address, scheduled date, cost, charged-to-customer, contact phone) when mode is
   *_to_customer via HSS; both for mode 3. "Mark delivered" sets deliveredAt and status,
   and marks its items `arrived_complete` (partial keeps items as is).
2. Split: in the delivery modal, "Split items into a new delivery" - pick items → creates a
   second Delivery on the same PO/order, moves those items. Also "Move to another
   delivery". Merge = move all items back and delete the empty delivery.
3. Auto-create: `createPurchaseOrder` also creates the PO's default Delivery (mode from
   shipTo) and attaches the items; a delivery is created for HSS-stock items that have no
   PO via a "New delivery (from HSS stock)" button (mode hss_to_customer).
4. PO "Advance to Shipped" opens a dialog: carrier, tracking URL, ETA (+ optional
   trucker/scheduled date when mode 3). Saves to the PO's delivery, sets delivery status
   `in_transit`, advances the PO. Remove the old `TrackingEdit` form; the PO modal shows the
   delivery's tracking read-only with a link to the Delivery tab.
5. `/deliveries` page: query Delivery instead of PurchaseOrder. Sections as today (needs
   attention / scheduled / recently delivered), mode badge, inline trucker + status.
   `TruckerSelect`, `DeliveryStatusPill` re-pointed to Delivery ids/actions.
6. Actions (replace the PO logistics ones): `createDelivery`, `updateDelivery`,
   `setDeliveryStatus`, `setDeliveryTrucker`, `splitDelivery`, `moveItemsToDelivery`,
   `deleteEmptyDelivery`, `markPoShipped`. Each calls `recomputeOrderStatus`.
7. Remove the deprecated PO logistics fields from `prisma/schema.prisma` (schema only - no
   SQL) and from every remaining reference; `prisma generate && tsc` must pass.

### C. Purchase orders: AutoQuotes #, PDF, quote + terms on the order (Sonnet)
Owns: `src/app/orders/[id]/PurchaseOrdersSection.tsx` (create form + rows, not B's
shipped dialog), `src/app/orders/[id]/PaymentsSection.tsx`, new
`src/app/orders/[id]/po/[poId]/pdf/route.ts`, new `src/app/orders/[id]/TermsCard.tsx`,
`src/app/admin/settings/**`, `package.json` (add `pdf-lib` only).
1. Create-PO form gets "AutoQuotes PO #" (text, prominent, optional). Row + modal show it.
   `createPurchaseOrder` gains the param; new `setPoAutoQuotesNumber` for later edits.
   Order header (via D) will list them; C exposes nothing else there.
2. PO PDF: route handler builds a PDF with `pdf-lib` (no native deps): company block from
   AppSetting (name/address/phone/email; fallback "HSS Kitchen Equipment Inc, Brooklyn NY"),
   PO number, AutoQuotes PO #, date, supplier name + address, ship-to (HSS or the order's
   delivery address + location name), items table (name, details, qty, unit cost, line
   total), totals, notes, footer setting. Button "PDF" on each PO row and in the modal
   (opens in a new tab). Logs `po_pdf_viewed`? No - reads aren't logged.
3. Invoice tab: `TermsCard` at top: terms badge + deposit amount + notes with an "Edit
   terms" form (re-runs `applyTermsToOrder`; guarded when any payment is already paid:
   warn and only allow notes). Quote row: `quoteStatus` BadgeSelect + quote link input
   (`setOrderQuote`). Payment rows: inline "QuickBooks link" edit (`setPaymentQuickbooksRef`)
   and show `dueNote` + a "from terms" hint for `source = terms`.
4. Admin → Settings: "Company details (PO PDF)" form (name, address, phone, email, footer)
   and "Customer service default assignee" select, stored via `setSetting`.

### D. Order overview, item-status drill-down, files (Opus)
Owns: `src/app/orders/[id]/page.tsx`, `OrderTabs.tsx`, `OrderHeaderControls.tsx`, new
`ItemStatusChips.tsx`, new `FilesSection.tsx`, `src/app/orders/page.tsx`, new
`src/lib/storage.ts`, new `src/app/files/actions.ts`, `package.json` (add
`@supabase/supabase-js` only), `src/app/pipeline/[id]/page.tsx` (Files card region only).
1. Header: replace the 5-step stepper with the full 9-step `fullFlowSteps` from
   `orderBall`, plus `BallInCourtBadge`. Show Location (name + address), AutoQuotes PO #s
   (comma list from its POs), terms badge.
2. Overview strip (one row of four mini-cards under the stepper): Items · POs ·
   Deliveries · Invoices - each with counts by status and a link to its tab.
3. Item status chips: group live items into "Being priced" (needs_pricing / rfq_sent /
   quote_received), "Not on a PO", then each delivery status. Clicking a chip opens a
   dialog listing ONLY those items with their `BadgeSelect` delivery status (reuse
   `setLineItemDeliveryStatus`) and a link to their PO/delivery. Orders list shows a
   compact "3/5 delivered · 1 pricing" summary per row.
4. Tabs become Invoice · Purchase Orders · Delivery · Files · Service (Service panel is
   E's `OrderIssuesPanel`; import it). Hash deep links for the new tabs.
5. Files: `FilesSection` lists Documents for the order AND its opportunity (grouped),
   with kind badge, source icon (Google Drive detected from `drive.google.com` /
   `docs.google.com` hosts), open link, delete (confirm). Add: "Paste a link" (URL + kind
   + note) or "Upload a file" (PDF/images, max 25 MB). Upload flow: server action
   `createSignedUpload(linkedType, linkedId, fileName, mimeType)` returns a Supabase
   Storage signed upload URL (bucket `order-files`, path
   `<linkedType>/<linkedId>/<cuid>-<safe-name>`); the browser PUTs the file; then
   `finalizeUpload` creates the Document. Download via `getSignedDownloadUrl` (1 hour).
   `src/lib/storage.ts` wraps `@supabase/supabase-js` with `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`; when either is missing, `uploadsConfigured() === false`
   and the UI shows "Direct upload isn't configured yet - paste a link instead" (links
   always work). Same Files card on the deal page (drawings arrive during sales).

### E. Customer Service log (Sonnet)
Owns: new `src/app/service/**`, new `src/app/orders/[id]/OrderIssuesPanel.tsx`,
`src/app/nav.tsx` (one nav item), `src/app/dashboard/page.tsx` (one QueueCard),
`src/app/companies/[id]/page.tsx` (one Issues card).
1. `/service`: list of ServiceIssues (open first, then by reportedAt desc) with
   `ListControls` filters (status, assignee, company, priority) and status chips. Row:
   title, company → location → order → item breadcrumb, assignee avatar, reported date,
   status BadgeSelect, priority badge. Click → detail drawer/modal with description,
   resolution, resolve button (sets resolvedAt).
2. "Log an issue" form: company combobox → location select (that company's) → order select
   (that company's orders) → item select (that order's items); title, description, priority,
   reported date (default today), assignee (default = `service.defaultAssigneeId` setting,
   else the active user whose name starts with "Sam", else unassigned).
3. `OrderIssuesPanel` for the order's Service tab: the order's issues + a quick-add
   pre-linked to the order (company/location inherited).
4. Dashboard queue "Open service issues" (top 5, link to /service). Company page: "Service
   issues" card. Nav: Fulfill → "Customer Service".
5. Actions in `src/app/service/actions.ts`: create/update/setStatus/assign/resolve, each
   logged and revalidating `/service`, the order, the company, `/dashboard`.

### F. Permissions by role (Sonnet)
Owns: new `src/app/admin/permissions/**`, `src/app/admin/AdminTabs.tsx`, `src/app/nav.tsx`
(hide Admin for non-admins - coordinate: E adds an item to the same file; keep edits
minimal), plus one-line `requirePermission` guards at the top of existing actions.
1. Admin → Permissions tab: matrix (rows = permissions grouped, columns = roles) of
   toggles; `setRolePermission(role, permission, allowed)`; "Reset to defaults" per role.
   Show the current user's effective role and a note that identity is the sidebar picker.
2. Guards: `deals.close` on markOpportunityWon/Lost; `pricing.edit` on rfq actions;
   `payments.edit` on addInvoice/markPaymentPaid/undo; `pos.edit` on createPurchaseOrder/
   advancePoStatus; `admin.manage` on admin actions; `phonebook.edit` on company/contact
   create/update; `intake.create` on submitIntake (redirect with `?error=not_allowed`,
   render the banner). For actions returning ActionResult: `const denied = await
   requirePermission("x"); if (denied) return denied;` as the FIRST statement.
3. UI gating (light touch): the Admin nav item and the Close panel render only when
   allowed (server components can `await can(...)`); everything else relies on the action
   denial toast.

### A2. Lead time + ball-in-court everywhere (Sonnet, Phase 2b)
Owns: `src/app/rfq/RfqRow.tsx` + `rfq/actions.ts` (lead-time action), `pipeline/LineItemRow.tsx`,
`pipeline/[id]/page.tsx` (header + stepper region), `pipeline/_ui.tsx`, `pipeline/KanbanBoard.tsx`,
`pipeline/PipelineList.tsx`, `pipeline/page.tsx`, `orders/[id]/LineItemsSection.tsx`
(lead-time column only), `dashboard/page.tsx` (ball badges in My Deals / My Orders rows).
1. RFQ row: "Lead time (days)" inline number next to price (`setLineItemLeadTime`), shown
   as "N d lead · est. <date>" (today + N days). Deal line items and order line items show
   the lead time column. Deal page shows "Longest lead time: N days" in the Deal card.
2. Ball-in-court: `BallInCourtBadge` on pipeline list rows, kanban cards, deal header,
   orders list rows, dashboard My Deals/My Orders rows. Deal page stepper becomes the
   9-step `fullFlowSteps` (sales-side steps clickable as today via `moveStageFromStepper`
   mapping: sales→new, pricing→estimating, close→#close; order-side steps link to the
   order when won).

---

## 4. Phase 3 (orchestrator, Fable)
1. Merge/verify: `npx prisma generate && npx tsc --noEmit && npm run lint && npm run build`.
2. Apply `prisma/sql/20260903_sales_orders_delivery.sql` to Supabase via MCP; create the
   `order-files` storage bucket (private) via SQL on `storage.buckets`; verify with
   `list_tables`.
3. Commit + push. Report: what shipped, the two env vars the user must add to Vercel for
   uploads (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), the time log.

## 5. Out of scope (this pass)
Real authentication (identity stays the sidebar picker), a Google Drive picker (paste the
share link), AutoQuotes API integration (numbers are typed), quantity-level delivery
splits (items move whole), dropping the deprecated PO columns from the database.
