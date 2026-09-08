# HSS Kitchens — User Flow Map & UX Redesign Spec (v1)

Planned by Fable, executed by Opus (sales surfaces) + Sonnet (ops surfaces).
Problem: the app is organized as *database pages* (one page per table). The redesign
organizes it around *the flow of an order* and *each person's daily queues*.

## 1. The people and their days

| Person | Role | Their day in the app |
|---|---|---|
| Herman | Sales | Take calls → quick intake → chase deals (follow-ups, revisions) → send proposals |
| Sam | Purchasing / PM | Price new items (RFQ) → after payment, build & send POs → chase acks → track shipments → delivery-day checks |
| Mrs. Perl | Billing | See won orders → record deposit/full payment + QB invoice → that unblocks purchasing |
| Sean | Design | Projects needing 3D renderings → mark rendering approved |

## 2. The journey of one order (the flow every screen must orient around)

```
Phone call / email
      │
      ▼
 INTAKE (Herman, fast — often mid-call)
      │
      ├─ needs pricing / Project ──► OPPORTUNITY + line items
      │                                │
      │                                ▼
      │                          ESTIMATING (Sam): each item
      │                          needs_pricing → rfq_sent → quote_received → priced_in_AutoQuotes
      │                                │
      │                                ▼
      │                          PROPOSAL SENT → (revisions loop) → WON ──┐
      │                                                        └─ LOST (reason)
      └─ simple re-order, priced ────────────────────────────────────────►│
                                                                          ▼
                                                                       ORDER
                                                                          │
                                              PAYMENT GATE (Mrs. Perl): deposit (project) / full (order)
                                                                          │
                                              POs BY SUPPLIER (Sam): draft → sent → acknowledged (→ delivery)
                                                                          │
                                              TRANSIT: shipped → at HSS / direct → to client
                                                                          │
                                              DELIVERY DAY check → COMPLETE
```

Cross-cutting: the manual urgency flag was removed - orders due soonest jump
every queue instead, keyed off needed_by_date. Tasks and Phone Book support
all phases.

## 3. Redesign decisions

### A. Navigation grouped by phase (shell — Fable)
```
TODAY        Dashboard
SELL         New Intake · Pipeline · RFQ Queue
FULFILL      Orders
EVERYONE     Phone Book · Tasks
```
Section labels small/uppercase; "New Intake" is additionally surfaced as a
persistent primary button at the top of the sidebar (the app's #1 action).

### B. FlowStepper on every record (shared component — Fable; used by both agents)
A horizontal stepper showing where THIS record is in the journey of §2.
- Opportunity detail: Intake → Estimating → Proposal → Negotiation → Closed
  (won links to its order; lost shows reason). Derived from stage.
- Order detail: Payment → POs → In Transit → Delivery → Complete. Derived from
  status + payments + PO states.
Steps: done (green check), current (accent, bold), upcoming (gray). Current
step's label includes the ONE next action ("Record deposit", "Send 2 POs").

### C. Dashboard = queues, not stats (Sonnet)
Replace stat-card grid with actionable queues, each a .card listing top items
with deep links and one primary action per row:
1. 🔴 Overdue & due this week orders (not delivered/complete, by needed_by_date) - pinned top, red accent (removed the manual urgency flag - the client's call is to filter by due date instead)
2. Follow-ups due (today + overdue, oldest first)
3. Items needing pricing (RFQ) — with "days waiting"
4. Orders awaiting payment — amount + type (deposit/full)
5. POs awaiting acknowledgment / shipments in transit
6. Deliveries this week
Compact stat strip (counts only) moves to a single row at top. Each queue shows
max 5 rows + "View all →".

### D. Intake rebuilt for speed (Opus)
One screen, no numbered wizard cards. Desktop: two columns.
- LEFT: Who (existing search-first; new-client fields collapse open) + When + Salesperson.
- RIGHT: Items (the heart — first row auto-focused, Enter adds another row) + Needs pricing / Order type.
- Project extras (facility, dimensions, delivery, installation) appear as a
  collapsible "Project details" section ONLY when Order Type = Project.
- Sticky footer bar: summary ("3 items · Project · Baumsglutenfree") + one CTA
  whose label tells the outcome: "Create opportunity" / "Create order".

### E. Pipeline cards lean (Opus)
Card = title, company, value, stage select, days-in-stage, next-follow-up chip
(orange when overdue). Remove salesperson from card face (hover/detail). Detail
page gets FlowStepper + "next best action" header button (stage-dependent:
e.g. estimating → "Open RFQ items", proposal_sent → "Mark revisions/won").

### F. RFQ queue: add By-Supplier view (Sonnet)
Sam emails suppliers in batches. Add view toggle chips: **By status** (current) /
**By supplier** (items grouped by supplier, unassigned first, per-group "mark all
rfq_sent" action). Keep inline supplier/cost/price editing.

### G. Order detail reordered by flow (Sonnet)
FlowStepper at top. Sections in flow order, and the CURRENT phase's section is
visually prominent (accent left border): Payment (top while unpaid) → Line Items
→ Purchase Orders → Delivery info. Header primary action is contextual:
unpaid → "Record payment"; paid+items unassigned to POs → "Create POs";
POs sent → "Acknowledge POs" (each PO is acknowledged on its own, since that
step picks how it ships and creates the delivery); all delivered → "Mark complete".

### H. Consistent detail-page header pattern (both)
Back link · title · badges · ONE contextual primary action (btn-primary) right.
Everything else is secondary (.btn).

### I. Empty states teach the flow (both)
E.g. RFQ empty: "Nothing needs pricing. New items land here from Intake when
they need a price." Include link to the upstream step.

### J. Out of scope for this pass
Drag-and-drop kanban, mobile nav collapse, auth, notifications, AutoQuotes
integration. Visual language (colors/type/components) unchanged — this is
IA/UX, not a restyle.
