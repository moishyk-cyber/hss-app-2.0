# HSS Kitchens

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

HSS's sales, purchasing, billing, customer service, and administration teams work from the same order records. Billing needs a central workspace for deposits and invoices.

## Product Purpose

Coordinate intake, sales, pricing, orders, billing, purchasing, delivery, and customer service. Billing tracks pending deposits before invoices are issued, then advances records through invoiced and paid.

## Capabilities and Constraints

Next.js, React, Prisma, and PostgreSQL. Billing records belong to orders and retain links to QuickBooks. The app tracks billing records; invoice issuance occurs in QuickBooks. Due dates and received-payment dates have separate meanings. Existing order workflows, permission checks, and payment confirmation controls remain authoritative.

## Evidence on Hand

Existing application routes and `docs/DATA_MODEL.md`, `docs/UI_PATTERNS.md`, and `docs/DESIGN_V2.md`. Pending-deposit tracking was confirmed by the user on October 8, 2026.

## Approved Workflow (October 21, 2026)

The single Record detail page has eight steps: Intake → Supplier Quotes → Client Quote → Confirm Deal → Payment → Purchase → Delivery → Close Out.

Client Quote records creation and sending on the deal before confirmation. The app tracks the externally prepared/sent document; it does not generate or email customer quotes. Confirm Deal records the decision and agreed price. Payment opens purchasing according to the account's payment rule. There are no separate Agreed Terms, Sales Order, or order-level quote-status gates. Purchase retains an Sales order sent Yes/No toggle that never blocks filling or logging POs. Optional payment notes and historical quote/sales-order data remain available without blocking progress. Existing confirmed orders are not reopened by the newly introduced pre-confirmation quote requirement.

The intake Pipeline board uses the first five approved steps through Payment; the Orders board continues with Purchase, Delivery and Close Out. Direct orders awaiting payment are included in intake alongside deals, with global filtering and sorting applied across both sources. Completed/lost records remain in the Closed list. Lane membership comes from saved requirements, not legacy proposal/revisions/negotiation statuses. Moving a card cannot fabricate completion: missing prerequisites open a dialog with a link to the required work. The table and Next step filters/sort use the same full-dataset workflow index and stable lane totals.

Blocked Pipeline moves open a centered, focused workflow form with the first unfinished step's actual controls. Intake, supplier quotes, client quote, deal confirmation, payment, purchase, delivery, and close out reuse their detail-page forms and validation. Saving refreshes the workflow; full record details remain available separately.

Focused workflow modals close automatically once successful saved evidence completes their step. Partial saves and validation errors keep the form open. Confirming or losing a deal in its focused form returns to the board after the successful action. Reviewing a step that was already complete does not immediately dismiss its form.

A Pipeline move opens its requirements modal synchronously, before prerequisite lookup or navigation. The modal displays an animated Loading requirements indicator until the focused form is ready. Cancelling during loading prevents a late prerequisite response from reopening the form. Loading-to-form handoffs retain keyboard containment, background inertness and scroll locking until the last dialog closes.

Pipeline cards can only be moved forward from the kanban or its next-step menu. Backward moves are rejected on the server; editing underlying prerequisites (for example marking a paid invoice unpaid) still recalculates the earlier step automatically.

RFQ authorization overlaps independent identity and settings reads. Audit logging reuses the server-verified actor within that request instead of repeating user lookups.

RFQ status saves use a compact authenticated JSON endpoint, preserving the RFQ/deal permission checks and transactional reconciliation. Durable audit entries are saved before acknowledgement; notification processing and email dispatch run after the response with existing audit-based retries. Saved status controls do not wait for collection rerenders. Focused supplier-quote forms use the returned workflow evidence directly and refresh the board when the step completes.


Pipeline and Orders cards show the reference card structure only: deal, customer, value and age, ball in court, and document icons. Workflow checklists, terms, Sales Order sent status, and next-step selectors remain off the cards.

Intakes and confirmed orders use one record workspace: the original horizontal workflow across the top, read-only details on the left, and the selected work section on the right (stacked at narrow widths). The single canonical detail page is /records/[id], which continues from intake through fulfillment. Orders list/board links and successful deal confirmation open it directly. Legacy /orders/[id] and /pipeline/[id] detail URLs redirect there; directly-created orders use their own ID at the same canonical page. There is no separate fulfillment detail page or copy. The former deal edit URL redirects to the Intake step, where the complete intake form now lives. Original project details and notes remain available in the confirmed record's Intake section; current order details are edited there. Terms stay under Payment and the nonblocking Sales Order Yes/No control stays under Purchase. Focused prerequisite modals retain their existing completion behavior.


The intake Pipeline kanban shows Intake → Supplier Quotes → Client Quote → Confirm Deal → Payment. Active fulfillment work appears on Orders as Purchase → Delivery → Close Out. Payment work stays on intake; delivered orders wait in Close Out until explicitly completed, then leave the board. All eight steps remain available on the single Record page.

Kanban cards share the reference structure using existing app styling: title, customer, amount and age, ball-in-court person, then one document button per attached file, labeled by file type. Files from intake, linked orders and POs, plus a saved client quote link, appear together. Empty file sections are hidden; files wrap after four per row. Attachment metadata is fetched in batches for visible records; private download URLs are signed only when opened. File Open controls and card document buttons use the shared preview modal, with image previews and on-demand PDF.js rendering, page navigation and zoom. The PDF worker and rendering resources are hosted by this app and prepared from the installed dependency during postinstall. Other linked documents use a sandboxed frame, with an Open in new tab fallback for sites that prevent embedding. Sales Order is available as an attachment category; its sent toggle remains nonblocking.
