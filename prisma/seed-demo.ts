/**
 * HSS Kitchens — DEMO data seed (additive).
 *
 * Creates a realistic slice of NY-area kosher/commercial-kitchen business so the
 * app and the reporting dashboard have something lived-in to show. It NEVER
 * deletes or edits existing rows.
 *
 * Every row it writes is marked so `remove-demo.ts` can delete exactly this set:
 *   - models with `notes`      -> notes starts with "[demo] "
 *   - TaskComment              -> body ends with " [demo]" (authorName stays real)
 *   - ActivityLog              -> detail ends with " [demo]"
 *   - IntakeSubmission         -> payload JSON contains "demo": true
 *
 * Data is deterministic (fixed-seed PRNG, hand-written arrays) so re-running
 * produces the same shape; only the dates move, since they are relative to now.
 *
 * Writes are batched with createMany wherever the new ids aren't needed
 * downstream — this runs against a remote Postgres, so round trips are the
 * cost that matters. Where ids ARE needed, the marker carries the row index so
 * they can be mapped back with one follow-up read.
 *
 *   npm run seed:demo
 *   npm run seed:demo:remove
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --- markers ---------------------------------------------------------------
const NOTE = "[demo] ";
const SUFFIX = " [demo]";

/** Marker that also carries the row's index, so ids can be mapped back after createMany. */
function tag(kind: string, i: number) {
  return `${NOTE}Demo ${kind} #${i}.`;
}
function indexOfTag(notes: string | null): number {
  const m = notes?.match(/#(\d+)\.$/);
  return m ? Number(m[1]) : -1;
}

// --- deterministic helpers -------------------------------------------------

/** mulberry32 — small, dependency-free, reproducible. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260825);

function int(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
function chance(p: number) {
  return rng() < p;
}

const NOW = new Date();
function daysAgo(n: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}
function daysAhead(n: number) {
  return daysAgo(-n);
}
function money(n: number) {
  return Math.round(n);
}
/** Sale price from cost at an 18–35% gross margin. */
function priceFromCost(cost: number) {
  const margin = 0.18 + rng() * 0.17;
  return money(cost / (1 - margin));
}

const t0 = Date.now();
function step(msg: string) {
  console.log(`  [${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`);
}
function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18);
}

// --- source data -----------------------------------------------------------

type CompanySeed = {
  name: string;
  vertical: string;
  city: string;
  zip: string;
  phone: string;
  priority?: boolean;
};

const CUSTOMERS: CompanySeed[] = [
  { name: "Gottlieb's Restaurant", vertical: "restaurant", city: "352 Roebling St, Brooklyn, NY", zip: "11211", phone: "7183876004", priority: true },
  { name: "Mendel's Catering", vertical: "venue_catering", city: "1421 Coney Island Ave, Brooklyn, NY", zip: "11230", phone: "7182531600" },
  { name: "Shloimy's Glatt Market", vertical: "supermarket", city: "4514 13th Ave, Brooklyn, NY", zip: "11219", phone: "7188511234" },
  { name: "Congregation Bais Yaakov Kitchen", vertical: "shul", city: "1650 56th St, Brooklyn, NY", zip: "11204", phone: "7184362200" },
  { name: "Camp Morris", vertical: "school", city: "88 Winterton Rd, Bloomingburg, NY", zip: "12721", phone: "8457339090" },
  { name: "The Crown Hotel Kitchen", vertical: "hotel", city: "570 Kingston Ave, Brooklyn, NY", zip: "11203", phone: "7189462700", priority: true },
  { name: "Sabra Grill", vertical: "restaurant", city: "419 Avenue P, Brooklyn, NY", zip: "11223", phone: "7186751515" },
  { name: "Lakewood Kosher Provisions", vertical: "supermarket", city: "1700 Madison Ave, Lakewood, NJ", zip: "08701", phone: "7323641800" },
  { name: "Bais Medrash Govoha Dining", vertical: "shul", city: "617 Sixth St, Lakewood, NJ", zip: "08701", phone: "7329052000" },
  { name: "Monsey Glatt Caterers", vertical: "venue_catering", city: "45 Route 59, Monsey, NY", zip: "10952", phone: "8453524444", priority: true },
  { name: "Teaneck Bagel Café", vertical: "restaurant", city: "358 Cedar Ln, Teaneck, NJ", zip: "07666", phone: "2018374040" },
  { name: "Yeshiva of Flatbush Cafeteria", vertical: "school", city: "1609 Ave J, Brooklyn, NY", zip: "11230", phone: "7183771100" },
  { name: "Pomegranate Supermarket", vertical: "supermarket", city: "1507 Coney Island Ave, Brooklyn, NY", zip: "11230", phone: "7183375400" },
  { name: "Boro Park Simcha Hall", vertical: "venue_catering", city: "4901 14th Ave, Brooklyn, NY", zip: "11219", phone: "7188548900" },
  { name: "Five Towns Fish & Grill", vertical: "restaurant", city: "489 Central Ave, Cedarhurst, NY", zip: "11516", phone: "5165692222" },
];

const VENDORS = [
  { name: "Restaurant Depot Wholesale", type: "supplier", phone: "7183926000", city: "1919 Flushing Ave, Queens, NY", zip: "11385" },
  { name: "Hudson Valley Equipment Supply", type: "supplier", phone: "8453317700", city: "120 Broadway, Newburgh, NY", zip: "12550" },
  { name: "Empire Refrigeration Distributors", type: "vendor", phone: "7183894455", city: "58 Meserole Ave, Brooklyn, NY", zip: "11222" },
];

const CONTACT_NAMES: [string, string, string][] = [
  ["Yitzy", "Gottlieb", "Owner"],
  ["Menachem", "Weiss", "Manager"],
  ["Shloimy", "Rosenberg", "Owner"],
  ["Chaim", "Braun", "Purchasing"],
  ["Dovid", "Klein", "Head Chef"],
  ["Moshe", "Teitelbaum", "Manager"],
  ["Avrumi", "Schwartz", "Purchasing"],
  ["Yosef", "Landau", "Owner"],
  ["Berel", "Friedman", "Kitchen Manager"],
  ["Shimon", "Katz", "Head Chef"],
  ["Naftali", "Green", "Billing"],
  ["Eli", "Hirsch", "Manager"],
  ["Zalman", "Perlman", "Purchasing"],
  ["Yaakov", "Stern", "Owner"],
  ["Meir", "Adler", "Kitchen Manager"],
  ["Sruly", "Halberstam", "Manager"],
  ["Pinchas", "Roth", "Head Chef"],
  ["Tzvi", "Neuman", "Purchasing"],
  ["Aron", "Deutsch", "Owner"],
  ["Yechiel", "Fried", "Billing"],
];

const EQUIPMENT: [string, number][] = [
  ["Double convection oven", 6400],
  ["3-compartment sink", 980],
  ["60qt floor mixer", 7200],
  ["Walk-in condenser unit", 5400],
  ["Blast chiller", 9800],
  ["Stainless prep table, 6ft", 620],
  ["Type 1 hood system, 12ft", 8600],
  ["Six-burner range with oven", 3100],
  ["Under-counter dishwasher", 4200],
  ["Reach-in freezer, 2 door", 3900],
  ["Deck pizza oven", 7600],
  ["Steam kettle, 40 gallon", 8800],
  ["Tilting skillet", 11200],
  ["Hand wash sink", 240],
  ["Wire shelving unit", 310],
  ["Meat slicer, 12in", 1850],
  ["Combi oven, 10 pan", 14500],
  ["Refrigerated prep table, 72in", 2650],
  ["Fryer, twin basket", 2400],
  ["Exhaust make-up air unit", 6900],
  ["Ice machine, 500lb", 4100],
  ["Salamander broiler", 2200],
  ["Milk dispenser, triple", 1750],
  ["Rack oven, single", 16800],
  ["Warewash disposer", 1650],
];

const BRANDS = ["Vulcan", "Hobart", "True", "Sapphire", "Everest", "Turbo Air", "Rational", "Globe"];

const FACILITY_TYPES = ["Full-service restaurant", "Catering hall", "Retail market", "Institutional dining", "Hotel banquet kitchen", "Summer camp kitchen"];
const MENUS = ["Fleishig grill and smokehouse", "Dairy café and bakery", "Banquet and simcha service", "Deli counter and hot bar", "Camp dining hall, 3 meals daily", "Shabbos catering and takeout"];
const LOST_REASONS = [
  "went with cheaper importer",
  "project postponed to next fiscal year",
  "client used their own contractor's supplier",
];

const OPEN_STAGES = ["new", "info_missing", "estimating", "proposal_sent", "revisions_needed", "negotiation"] as const;
const RFQ_LADDER = ["needs_pricing", "rfq_sent", "quote_received", "priced_in_autoquotes", "approved"] as const;
const DELIVERY_LADDER = ["pending", "ordered", "in_transit_to_hss", "in_transit_to_client", "arrived_complete"] as const;

// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding demo data (additive)…\n");

  // --- users (found at runtime, never created) ---------------------------
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  step(`connected — found ${users.length} users`);
  const byName = (needle: string) =>
    users.find((u) => u.name.toLowerCase().includes(needle.toLowerCase()))?.id ?? null;

  const herman = byName("herman");
  const sam = byName("sam");
  const perl = byName("perl");
  const sean = byName("sean");
  const salesPool = [herman, herman, herman, sam, sean].filter(Boolean) as string[];
  if (!herman) console.warn("  ! No 'Herman' user found — opportunities will be unassigned.");

  // --- companies ---------------------------------------------------------
  await prisma.company.createMany({
    data: [
      ...CUSTOMERS.map((c, i) => ({
        name: c.name,
        type: "customer",
        vertical: c.vertical,
        priorityClient: c.priority ?? false,
        phone: c.phone,
        phoneExt: chance(0.3) ? String(int(10, 99)) : null,
        cellPhone: chance(0.5) ? `917${int(2000000, 8999999)}` : null,
        email: `office@${slug(c.name)}.com`,
        deliveryAddress: c.city,
        billingAddress: c.city,
        locationName: c.name.split(" ")[0],
        zip: c.zip,
        notes: tag("customer", i),
        createdAt: daysAgo(120 - i * 3),
      })),
      ...VENDORS.map((v, i) => ({
        name: v.name,
        type: v.type,
        phone: v.phone,
        email: `sales@${slug(v.name)}.com`,
        billingAddress: v.city,
        zip: v.zip,
        notes: tag("vendor", i),
        createdAt: daysAgo(118),
      })),
    ],
  });

  const demoCompanies = await prisma.company.findMany({
    where: { notes: { startsWith: NOTE } },
    select: { id: true, notes: true },
  });
  const customerIds: string[] = new Array(CUSTOMERS.length);
  const vendorIds: string[] = new Array(VENDORS.length);
  for (const c of demoCompanies) {
    const i = indexOfTag(c.notes);
    if (c.notes?.includes("Demo customer")) customerIds[i] = c.id;
    else if (c.notes?.includes("Demo vendor")) vendorIds[i] = c.id;
  }
  step(`companies: ${CUSTOMERS.length} customers + ${VENDORS.length} vendors`);

  // --- contacts ----------------------------------------------------------
  await prisma.contact.createMany({
    data: CONTACT_NAMES.map(([first, last, title], i) => ({
      firstName: first,
      lastName: last,
      title,
      companyId: customerIds[i % customerIds.length],
      email: `${first.toLowerCase()}@${slug(CUSTOMERS[i % CUSTOMERS.length].name)}.com`,
      phone: CUSTOMERS[i % CUSTOMERS.length].phone,
      phoneExt: chance(0.35) ? String(int(100, 199)) : null,
      cellPhone: `347${int(2000000, 8999999)}`,
      status: "active",
      notes: tag("contact", i),
      createdAt: daysAgo(115 - i * 2),
    })),
  });

  const demoContacts = await prisma.contact.findMany({
    where: { notes: { startsWith: NOTE } },
    select: { id: true, notes: true, companyId: true },
  });
  const contactByCompany = new Map<string, string[]>();
  for (const c of demoContacts) {
    if (!c.companyId) continue;
    const list = contactByCompany.get(c.companyId) ?? [];
    list.push(c.id);
    contactByCompany.set(c.companyId, list);
  }
  step(`contacts: ${demoContacts.length}`);

  // --- opportunities -----------------------------------------------------
  // 28 total: 19 open across the six live stages, 6 won, 3 lost.
  const stagePlan: string[] = [];
  for (let i = 0; i < 19; i += 1) stagePlan.push(OPEN_STAGES[i % OPEN_STAGES.length]);
  for (let i = 0; i < 6; i += 1) stagePlan.push("won");
  for (let i = 0; i < 3; i += 1) stagePlan.push("lost");

  type OppPlan = {
    stage: string;
    orderType: string;
    companyId: string;
    contactId: string | null;
    value: number;
    title: string;
  };
  const oppPlans: OppPlan[] = stagePlan.map((stage, i) => {
    const companyId = customerIds[i % customerIds.length];
    const company = CUSTOMERS[i % CUSTOMERS.length];
    const companyContacts = contactByCompany.get(companyId) ?? [];
    const orderType = i % 3 === 0 ? "project" : "order";
    const title =
      orderType === "project"
        ? `${company.name} — kitchen buildout`
        : `${company.name} — ${pick(["equipment refresh", "replacement order", "line expansion", "walk-in upgrade", "prep area order"])}`;
    return {
      stage,
      orderType,
      companyId,
      contactId: companyContacts.length ? companyContacts[i % companyContacts.length] : null,
      value: money(2000 + rng() * 83000),
      title,
    };
  });

  await prisma.opportunity.createMany({
    data: oppPlans.map((o, i) => {
      const company = CUSTOMERS[i % CUSTOMERS.length];
      const isProject = o.orderType === "project";
      return {
        title: o.title,
        companyId: o.companyId,
        primaryContactId: o.contactId,
        salespersonId: salesPool[i % salesPool.length] ?? null,
        stage: o.stage,
        orderType: o.orderType,
        needsPricing: o.stage !== "won",
        value: o.value,
        neededByDate: chance(0.75) ? daysAhead(int(-20, 30)) : null,
        estDueDate: chance(0.6) ? daysAhead(int(-10, 25)) : null,
        // Scatter follow-ups either side of today so overdue chips light up.
        nextFollowUp:
          o.stage === "won" || o.stage === "lost" ? null : chance(0.7) ? daysAhead(int(-14, 21)) : null,
        lostReason: o.stage === "lost" ? LOST_REASONS[i % LOST_REASONS.length] : null,
        facilityType: isProject ? pick(FACILITY_TYPES) : null,
        menu: isProject ? pick(MENUS) : null,
        roomDimensions: isProject ? `${int(18, 40)}ft x ${int(14, 30)}ft` : null,
        wallMeasurements: isProject ? `${int(10, 24)}ft run on the cook line` : null,
        deliveryType: isProject ? pick(["curbside", "inside"]) : null,
        openingSize: isProject && chance(0.5) ? `${int(30, 48)}in double door` : null,
        installationNeeded: isProject && chance(0.6),
        designStatus: isProject ? pick(["none", "rendering_in_progress", "rendering_approved"]) : "none",
        locationName: company.name.split(" ")[0],
        deliveryAddress: company.city,
        submittedVia: chance(0.4) ? "form" : "manual",
        notes: tag("opportunity", i),
        createdAt: daysAgo(110 - i * 3),
      };
    }),
  });

  const demoOppRows = await prisma.opportunity.findMany({
    where: { notes: { startsWith: NOTE } },
    select: { id: true, notes: true },
  });
  const oppIds: string[] = new Array(oppPlans.length);
  for (const o of demoOppRows) oppIds[indexOfTag(o.notes)] = o.id;
  const opps = oppPlans.map((p, i) => ({ ...p, id: oppIds[i] }));
  step(`opportunities: ${demoOppRows.length}`);

  // --- line items on opportunities (1..4 each => exactly 70) --------------
  const oppItemData = opps.flatMap((opp, i) => {
    const count = 1 + (i % 4);
    return Array.from({ length: count }, (_, k) => {
      const [name, baseCost] = EQUIPMENT[(i * 3 + k) % EQUIPMENT.length];
      const cost = money(baseCost * (0.9 + rng() * 0.25));
      const price = priceFromCost(cost);
      // Won deals are fully priced; open deals sit anywhere on the RFQ ladder.
      const rfqStatus =
        opp.stage === "won"
          ? "approved"
          : opp.stage === "lost"
            ? pick(["quote_received", "removed"])
            : RFQ_LADDER[(i + k) % RFQ_LADDER.length];
      const priced = rfqStatus !== "needs_pricing" && rfqStatus !== "rfq_sent";
      return {
        opportunityId: opp.id,
        name,
        description: `${pick(BRANDS)} ${name.toLowerCase()}`,
        qty: int(1, 8),
        itemKind: chance(0.12) ? "custom_fabrication" : "sourced",
        brand: pick(BRANDS),
        supplierId: chance(0.55) ? pick(vendorIds) : null,
        unitCost: priced ? cost : null,
        unitPrice: priced ? price : null,
        leadTimeDays: chance(0.6) ? int(5, 45) : null,
        rfqStatus,
        assigneeId: sam,
        nextFollowUp: chance(0.3) ? daysAhead(int(-8, 14)) : null,
        notes: `${NOTE}Demo line item.`,
        createdAt: daysAgo(105 - (i % 40)),
      };
    });
  });
  await prisma.lineItem.createMany({ data: oppItemData });
  step(`opportunity line items: ${oppItemData.length}`);

  // --- orders ------------------------------------------------------------
  // 6 promoted from the won deals + 4 straight-through orders.
  const wonOpps = opps.filter((o) => o.stage === "won");
  const orderStatuses = [
    "awaiting_payment",
    "payment_received",
    "pos_in_progress",
    "in_transit",
    "delivery_scheduled",
    "delivered",
    "complete",
    "stuck",
    "new",
    "pos_in_progress",
  ];

  type OrderPlan = {
    oppId: string | null;
    orderType: string;
    value: number;
    status: string;
    companyId: string;
    title: string;
    contactId: string | null;
  };
  const orderPlans: OrderPlan[] = Array.from({ length: 10 }, (_, i) => {
    const opp = i < wonOpps.length ? wonOpps[i] : null;
    const companyId = opp?.companyId ?? customerIds[(i * 5) % customerIds.length];
    const companyIndex = customerIds.indexOf(companyId);
    const company = CUSTOMERS[companyIndex >= 0 ? companyIndex : 0];
    const companyContacts = contactByCompany.get(companyId) ?? [];
    return {
      oppId: opp?.id ?? null,
      orderType: opp?.orderType ?? (i % 4 === 0 ? "project" : "order"),
      value: opp?.value ?? money(3000 + rng() * 40000),
      status: orderStatuses[i],
      companyId,
      title: opp
        ? opp.title
        : `${company.name} — ${pick(["walk-in repair parts", "reorder", "hot line replacement", "smallwares restock"])}`,
      contactId: companyContacts.length ? companyContacts[i % companyContacts.length] : null,
    };
  });

  await prisma.order.createMany({
    data: orderPlans.map((o, i) => {
      const companyIndex = customerIds.indexOf(o.companyId);
      const company = CUSTOMERS[companyIndex >= 0 ? companyIndex : 0];
      return {
        title: o.title,
        opportunityId: o.oppId,
        companyId: o.companyId,
        contactId: o.contactId,
        ownerId: salesPool[i % salesPool.length] ?? null,
        orderType: o.orderType,
        status: o.status,
        clientPoNumber: chance(0.5) ? `PO-${int(1000, 9999)}` : null,
        jobId: `HSS-2026-${String(41 + i).padStart(3, "0")}`,
        quickbooksInvoiceNo: chance(0.4) ? `QB-${int(2000, 2999)}` : null,
        orderValue: o.value,
        deliveryAddress: company.city,
        // Spread a few needed-by dates into the past and the next few days so
        // the Orders/Deliveries/Dashboard "overdue" and "due soon" states both
        // have demo rows to show (i === 2 overdue, i === 4 due this week).
        neededByDate: i === 2 ? daysAhead(int(-4, -1)) : i === 4 ? daysAhead(int(0, 3)) : daysAhead(int(-5, 28)),
        nextFollowUp: chance(0.6) ? daysAhead(int(-6, 12)) : null,
        notes: tag("order", i),
        createdAt: daysAgo(60 - i * 4),
      };
    }),
  });

  const demoOrderRows = await prisma.order.findMany({
    where: { notes: { startsWith: NOTE } },
    select: { id: true, notes: true },
  });
  const orderIds: string[] = new Array(orderPlans.length);
  for (const o of demoOrderRows) orderIds[indexOfTag(o.notes)] = o.id;
  const orders = orderPlans.map((p, i) => ({ ...p, id: orderIds[i] }));
  step(`orders: ${demoOrderRows.length}`);

  // Carry each won deal's items across, the way Mark Won does.
  for (const [i, order] of orders.entries()) {
    if (!order.oppId) continue;
    await prisma.lineItem.updateMany({
      where: { opportunityId: order.oppId, notes: { startsWith: NOTE } },
      data: { orderId: order.id, deliveryStatus: DELIVERY_LADDER[i % DELIVERY_LADDER.length] },
    });
  }

  // Straight-through orders get their own items.
  const directItemData = orders.flatMap((order, i) =>
    order.oppId
      ? []
      : Array.from({ length: 2 }, (_, k) => {
          const [name, baseCost] = EQUIPMENT[(i * 4 + k) % EQUIPMENT.length];
          const cost = money(baseCost * (0.9 + rng() * 0.2));
          return {
            orderId: order.id,
            name,
            description: `${pick(BRANDS)} ${name.toLowerCase()}`,
            qty: int(1, 6),
            brand: pick(BRANDS),
            supplierId: pick(vendorIds),
            unitCost: cost,
            unitPrice: priceFromCost(cost),
            rfqStatus: "approved",
            deliveryStatus: pick(["pending", "ordered", "in_transit_to_hss", "arrived_complete"]),
            assigneeId: sam,
            notes: `${NOTE}Demo line item.`,
            createdAt: daysAgo(55 - i * 3),
          };
        })
  );
  await prisma.lineItem.createMany({ data: directItemData });
  step(`order line items: ${directItemData.length} direct (+ won deals' items carried over)`);

  // --- payments ----------------------------------------------------------
  const paidish = ["payment_received", "pos_in_progress", "in_transit", "delivery_scheduled", "delivered", "complete"];
  const paymentData = orders.flatMap((order, i) => {
    const isProject = order.orderType === "project";
    const status = paidish.includes(order.status)
      ? "paid"
      : order.status === "awaiting_payment"
        ? pick(["pending", "invoiced"])
        : pick(["pending", "invoiced", "paid"]);
    const rows = [
      {
        orderId: order.id,
        type: isProject ? "deposit" : "full",
        amount: money(isProject ? order.value * 0.3 : order.value),
        status,
        quickbooksRef: status === "paid" ? `QB-INV-${int(4000, 4999)}` : null,
        date: status === "paid" ? daysAgo(int(3, 45)) : null,
        notes: `${NOTE}Demo ${isProject ? "30% deposit" : "full payment"}.`,
        createdAt: daysAgo(50 - i * 3),
      },
    ];
    // Finished projects also show their balance payment.
    if (isProject && (order.status === "delivered" || order.status === "complete")) {
      rows.push({
        orderId: order.id,
        type: "final",
        amount: money(order.value * 0.7),
        status: order.status === "complete" ? "paid" : "invoiced",
        quickbooksRef: null,
        date: order.status === "complete" ? daysAgo(int(1, 20)) : null,
        notes: `${NOTE}Demo balance payment.`,
        createdAt: daysAgo(20),
      });
    }
    return rows;
  });
  await prisma.payment.createMany({ data: paymentData });
  step(`payments: ${paymentData.length}`);

  // --- purchase orders ---------------------------------------------------
  const poStatuses = ["draft", "sent", "sent", "acknowledged", "shipped", "received"];
  const carriers = ["UPS Freight", "XPO Logistics", "Estes", "FedEx Freight"];
  const TRUCKERS = ["ANDY", "UBER", "UPS DROPSHIP", "MOSHE"];
  await prisma.purchaseOrder.createMany({
    data: poStatuses.map((status, i) => {
      const order = orders[(i * 2 + 1) % orders.length];
      const shipped = status === "shipped" || status === "received";
      const sent = status !== "draft";
      return {
        orderId: order.id,
        supplierId: vendorIds[i % vendorIds.length],
        poNumber: `PO-2026-${String(120 + i).padStart(4, "0")}`,
        status,
        shipTo: chance(0.25) ? "client_direct" : "hss",
        sentDate: sent ? daysAgo(int(6, 30)) : null,
        ackDate: status === "acknowledged" || shipped ? daysAgo(int(2, 12)) : null,
        notes: tag("purchase order", i),
        createdAt: daysAgo(35 - i * 2),
      };
    }),
  });

  const demoPoRows = await prisma.purchaseOrder.findMany({
    where: { notes: { startsWith: NOTE } },
    select: { id: true, orderId: true, status: true, shipTo: true },
  });
  step(`purchase orders: ${demoPoRows.length}`);

  // --- delivery legs -----------------------------------------------------
  // Logistics live on Delivery, one leg per PO (the same shape createPurchaseOrder
  // produces). Hang a couple of each PO's order items off the PO and its leg.
  for (const [i, po] of demoPoRows.entries()) {
    const shipped = po.status === "shipped" || po.status === "received";
    const mode = po.shipTo === "client_direct" ? "manufacturer_to_customer" : "manufacturer_to_hss_to_customer";
    const delivery = await prisma.delivery.create({
      data: {
        orderId: po.orderId,
        purchaseOrderId: po.id,
        mode,
        status: po.status === "received" ? "delivered_full" : shipped ? "in_transit" : "pending",
        trackingUrl: shipped ? `https://tracking.example.com/${int(100000000, 999999999)}` : null,
        trackingCarrier: shipped ? pick(carriers) : null,
        expectedDelivery: daysAhead(int(1, 12)),
        trucker: shipped ? pick(TRUCKERS) : null,
        scheduledDeliveryDate: shipped ? daysAhead(int(1, 10)) : null,
        deliveredAt: po.status === "received" ? daysAgo(int(1, 10)) : null,
        notes: tag("delivery", i),
      },
    });

    const items = await prisma.lineItem.findMany({
      where: { orderId: po.orderId, notes: { startsWith: NOTE }, purchaseOrderId: null },
      select: { id: true },
      take: 2,
    });
    if (items.length) {
      await prisma.lineItem.updateMany({
        where: { id: { in: items.map((it) => it.id) } },
        data: { purchaseOrderId: po.id, deliveryId: delivery.id },
      });
    }
  }
  step(`delivery legs: ${demoPoRows.length}`);

  // --- tasks -------------------------------------------------------------
  const TASKS: [string, string, string, string][] = [
    ["Call Gottlieb's about hood clearance", "in_progress", "high", "customer_service"],
    ["Chase Empire Refrigeration on condenser quote", "not_started", "high", "external"],
    ["Send revised proposal to Monsey Glatt", "not_started", "critical", "customer_service"],
    ["Confirm delivery window with Camp Morris", "in_progress", "medium", "customer_service"],
    ["Measure cook line at Crown Hotel", "not_started", "medium", "external"],
    ["File QuickBooks invoice for HSS-2026-043", "done", "low", "internal"],
    ["Follow up on blast chiller lead time", "stuck", "high", "external"],
    ["Book rigging crew for Simcha Hall install", "not_started", "high", "external"],
    ["Update AutoQuotes pricing sheet", "in_progress", "low", "internal"],
    ["Verify deposit cleared for Pomegranate", "done", "medium", "internal"],
    ["Walk through punch list at Sabra Grill", "not_started", "medium", "customer_service"],
    ["Reorder wire shelving for Lakewood", "not_started", "low", "internal"],
    ["Schedule gas hookup inspection", "in_progress", "critical", "external"],
    ["Close out Teaneck Bagel service ticket", "done", "low", "customer_service"],
  ];

  const assigneePool = [herman, sam, perl, sean, null];
  await prisma.task.createMany({
    data: TASKS.map(([title, status, priority, type], i) => {
      // Link roughly two thirds of them to a demo order or opportunity.
      const linkToOrder = i % 3 === 0;
      const linkToOpp = i % 3 === 1;
      return {
        title,
        status,
        priority,
        type,
        assigneeId: assigneePool[i % assigneePool.length],
        // A few sit in the past so the overdue view has something to show.
        dueDate: status === "done" ? daysAgo(int(2, 20)) : daysAhead(int(-9, 18)),
        estimatedHours: chance(0.6) ? int(1, 8) : null,
        linkedType: linkToOrder ? "order" : linkToOpp ? "opportunity" : null,
        linkedId: linkToOrder ? orders[i % orders.length].id : linkToOpp ? opps[i % opps.length].id : null,
        notes: tag("task", i),
        createdAt: daysAgo(40 - i * 2),
      };
    }),
  });

  const demoTaskRows = await prisma.task.findMany({
    where: { notes: { startsWith: NOTE } },
    select: { id: true, notes: true },
  });
  const taskIds: string[] = new Array(TASKS.length);
  for (const t of demoTaskRows) taskIds[indexOfTag(t.notes)] = t.id;
  step(`tasks: ${demoTaskRows.length}`);

  // --- task comments -----------------------------------------------------
  const COMMENTS: [string, string][] = [
    ["Herman Freund", "Left a voicemail, trying again tomorrow morning."],
    ["Sam Freund", "Supplier says 6-8 weeks on the condenser, confirming in writing."],
    ["Herman Freund", "Client asked to swap to the 10-pan combi — repricing now."],
    ["Sam Freund", "Rigging quote came in at $1,400, waiting on approval."],
    ["Mrs. Perl", "Deposit cleared this morning, releasing to purchasing."],
    ["Sean Henderson", "Rendering sent for approval, no response yet."],
    ["Sam Freund", "Freight is on the truck, ETA Thursday."],
    ["Herman Freund", "Owner wants to walk the space before signing."],
    ["Mrs. Perl", "Invoice needs the client PO number before I can send it."],
    ["Sam Freund", "Punch list is down to two items."],
  ];
  await prisma.taskComment.createMany({
    data: COMMENTS.map(([authorName, body], i) => ({
      taskId: taskIds[i % taskIds.length],
      authorId: byName(authorName.split(" ")[0]),
      authorName,
      body: `${body}${SUFFIX}`,
      createdAt: daysAgo(int(1, 30)),
    })),
  });
  step(`task comments: ${COMMENTS.length}`);

  // --- intake submissions ------------------------------------------------
  const intakeData = Array.from({ length: 4 }, (_, i) => {
    const opp = opps[i * 5];
    return {
      payload: JSON.stringify({
        demo: true,
        clientMode: "existing",
        companyId: opp.companyId,
        orderType: opp.orderType,
        needsPricing: "yes",
        itemName: [EQUIPMENT[i][0], EQUIPMENT[i + 5][0]],
        notes: "Captured on the phone.",
      }),
      processed: true,
      resultType: "opportunity",
      resultId: opp.id,
      submittedAt: daysAgo(90 - i * 10),
    };
  });
  await prisma.intakeSubmission.createMany({ data: intakeData });
  step(`intake submissions: ${intakeData.length}`);

  // --- activity log ------------------------------------------------------
  type LogRow = { userName: string; linkedType: string; linkedId: string; action: string; detail: string; at: Date };
  const logs: LogRow[] = [];
  const addLog = (linkedType: string, linkedId: string, action: string, detail: string, at: Date, userName: string) =>
    logs.push({ userName, linkedType, linkedId, action, detail: `${detail}${SUFFIX}`, at });

  for (const [i, opp] of opps.entries()) {
    addLog("opportunity", opp.id, "intake_submitted", `Intake created "${opp.title}"`, daysAgo(108 - i * 3), "Herman Freund");
    if (opp.stage === "won") {
      addLog("opportunity", opp.id, "stage_changed", `"${opp.title}" marked Won`, daysAgo(int(10, 40)), "Herman Freund");
    } else if (opp.stage === "lost") {
      addLog("opportunity", opp.id, "stage_changed", `"${opp.title}" marked Lost`, daysAgo(int(10, 40)), "Herman Freund");
    } else if (i % 2 === 0) {
      addLog("opportunity", opp.id, "stage_changed", `Stage moved to ${opp.stage.replace(/_/g, " ")}`, daysAgo(int(2, 30)), "Herman Freund");
    }
  }
  for (const [i, order] of orders.entries()) {
    addLog("order", order.id, "order_created", `Order opened for ${order.status.replace(/_/g, " ")}`, daysAgo(58 - i * 4), "Herman Freund");
    if (i % 2 === 0) {
      addLog("order", order.id, "payment_recorded", "Payment recorded against the order", daysAgo(int(3, 30)), "Mrs. Perl");
    }
  }
  for (const [i, po] of demoPoRows.entries()) {
    addLog("purchase_order", po.id, "po_sent", "Purchase order sent to supplier", daysAgo(int(5, 28)), "Sam Freund");
    if (i % 2 === 0) {
      addLog("purchase_order", po.id, "po_acknowledged", "Supplier acknowledged the PO", daysAgo(int(2, 14)), "Sam Freund");
    }
  }
  await prisma.activityLog.createMany({ data: logs });
  step(`activity log entries: ${logs.length}`);

  // --- counts ------------------------------------------------------------
  const demoCounts = {
    Company: await prisma.company.count({ where: { notes: { startsWith: NOTE } } }),
    Contact: await prisma.contact.count({ where: { notes: { startsWith: NOTE } } }),
    Opportunity: await prisma.opportunity.count({ where: { notes: { startsWith: NOTE } } }),
    LineItem: await prisma.lineItem.count({ where: { notes: { startsWith: NOTE } } }),
    Order: await prisma.order.count({ where: { notes: { startsWith: NOTE } } }),
    PurchaseOrder: await prisma.purchaseOrder.count({ where: { notes: { startsWith: NOTE } } }),
    Delivery: await prisma.delivery.count({ where: { notes: { startsWith: NOTE } } }),
    Payment: await prisma.payment.count({ where: { notes: { startsWith: NOTE } } }),
    Task: await prisma.task.count({ where: { notes: { startsWith: NOTE } } }),
    TaskComment: await prisma.taskComment.count({ where: { body: { endsWith: SUFFIX } } }),
    IntakeSubmission: await prisma.intakeSubmission.count({ where: { payload: { contains: '"demo":true' } } }),
    ActivityLog: await prisma.activityLog.count({ where: { detail: { endsWith: SUFFIX } } }),
  };

  console.log("\nDemo rows now in the database:");
  let total = 0;
  for (const [table, n] of Object.entries(demoCounts)) {
    console.log(`  ${table.padEnd(18)} ${n}`);
    total += n;
  }
  console.log(`  ${"TOTAL".padEnd(18)} ${total}`);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s. Remove with: npm run seed:demo:remove`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
