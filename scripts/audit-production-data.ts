// Reliability spec P0-4 (data cleanup) - step 1 only: a READ-ONLY audit that
// lists exactly what the spec asks to review before anything is quarantined,
// reassigned, or deleted. It writes nothing to the database.
//
// Run: npx tsx --tsconfig tsconfig.json scripts/audit-production-data.ts
// (needs DATABASE_URL - this sandbox has none, so it has not been run here;
// the acceptance criteria call for running it against a staging copy first
// anyway, then reconciling record counts before it's ever run for real.)
//
// What it reports, in the spec's own order:
//   1. Open work owned by a deactivated teammate (the "28 items" class of bug) -
//      deal/order/task/RFQ item/service issue, each with a direct link.
//   2. Open records with no owner at all (same record types).
//   3. Suspect test/gibberish records - the literal examples named in the spec,
//      plus an obvious-placeholder-pattern scan (example.com/-domain emails,
//      digit-prefixed "test" names). This is a candidate list for a human to
//      confirm, not an auto-delete list - some short names WILL be real
//      businesses and must not be treated as gibberish by an algorithm alone.
//   4. Stale August tasks still open.
//   5. Phone Book (Company/Contact) records with placeholder emails/addresses
//      or missing key details.
//   6. Orphaned service issues (no company, location, order, or line item).
//
// Nothing here is idempotent because nothing here writes. Re-run any time -
// it always reflects the live data.

import { prisma } from "@/lib/prisma";

const KNOWN_SUSPECT_NAMES = [
  "123 Test",
  "Order",
  "htehj",
  "agra",
  "bafb",
  "zfnzdgn",
  "grgr",
  "6o78t",
  "abra",
  "agbhterhae",
];

function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /example\.com$/i.test(email) || /example-domain/i.test(email);
}

/** Best-effort only - a human confirms every hit before anything happens to it. */
function looksLikeGibberish(name: string): boolean {
  const trimmed = name.trim();
  if (KNOWN_SUSPECT_NAMES.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return true;
  if (/^\d+\s*test$/i.test(trimmed)) return true;
  // Short, all-lowercase, no vowels or no spaces - the shape of the QA-typed
  // examples above, not a real business/person name.
  if (/^[a-z]{4,10}$/.test(trimmed) && !/[aeiou]/i.test(trimmed)) return true;
  return false;
}

async function main() {
  const lines: string[] = [];
  const log = (s = "") => lines.push(s);

  log("=".repeat(78));
  log("PRODUCTION DATA AUDIT - read-only, reliability spec P0-4");
  log(`Run at ${new Date().toISOString()}`);
  log("=".repeat(78));

  // ---- 1. Open work owned by a deactivated teammate ----------------------
  log("\n## 1. Open work owned by a deactivated teammate\n");
  const [orphanOpps, orphanOrders, orphanTasks, orphanItems, orphanIssues] = await Promise.all([
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["won", "lost"] }, salespersonId: { not: null }, salesperson: { active: false } },
      select: { id: true, title: true, salesperson: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { status: { not: "complete" }, ownerId: { not: null }, owner: { active: false } },
      select: { id: true, title: true, owner: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { status: { not: "done" }, assigneeId: { not: null }, assignee: { active: false } },
      select: { id: true, title: true, assignee: { select: { name: true } } },
    }),
    prisma.lineItem.findMany({
      where: {
        rfqStatus: { in: ["needs_pricing", "rfq_sent", "quote_received"] },
        assigneeId: { not: null },
        assignee: { active: false },
      },
      select: { id: true, name: true, assignee: { select: { name: true } } },
    }),
    prisma.serviceIssue.findMany({
      where: { status: { in: ["open", "in_progress"] }, assigneeId: { not: null }, assignee: { active: false } },
      select: { id: true, title: true, assignee: { select: { name: true } } },
    }),
  ]);
  const inactiveOwnerTotal =
    orphanOpps.length + orphanOrders.length + orphanTasks.length + orphanItems.length + orphanIssues.length;
  log(`Total: ${inactiveOwnerTotal}`);
  for (const o of orphanOpps) log(`  deal        ${o.id}  "${o.title}"  (owner: ${o.salesperson?.name})`);
  for (const o of orphanOrders) log(`  order       ${o.id}  "${o.title}"  (owner: ${o.owner?.name})`);
  for (const t of orphanTasks) log(`  task        ${t.id}  "${t.title}"  (owner: ${t.assignee?.name})`);
  for (const i of orphanItems) log(`  rfq item    ${i.id}  "${i.name}"  (owner: ${i.assignee?.name})`);
  for (const s of orphanIssues) log(`  service     ${s.id}  "${s.title}"  (owner: ${s.assignee?.name})`);

  // ---- 2. Open records with no owner at all -------------------------------
  log("\n## 2. Open records with no owner\n");
  const [unassignedOpps, unassignedOrders, unassignedTasks, unassignedItems, unassignedIssues] = await Promise.all([
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["won", "lost"] }, salespersonId: null },
      select: { id: true, title: true },
    }),
    prisma.order.findMany({ where: { status: { not: "complete" }, ownerId: null }, select: { id: true, title: true } }),
    prisma.task.findMany({ where: { status: { not: "done" }, assigneeId: null }, select: { id: true, title: true } }),
    prisma.lineItem.findMany({
      where: { rfqStatus: { in: ["needs_pricing", "rfq_sent", "quote_received"] }, assigneeId: null },
      select: { id: true, name: true },
    }),
    prisma.serviceIssue.findMany({
      where: { status: { in: ["open", "in_progress"] }, assigneeId: null },
      select: { id: true, title: true },
    }),
  ]);
  const unassignedTotal =
    unassignedOpps.length + unassignedOrders.length + unassignedTasks.length + unassignedItems.length + unassignedIssues.length;
  log(`Total: ${unassignedTotal}`);
  for (const o of unassignedOpps) log(`  deal        ${o.id}  "${o.title}"`);
  for (const o of unassignedOrders) log(`  order       ${o.id}  "${o.title}"`);
  for (const t of unassignedTasks) log(`  task        ${t.id}  "${t.title}"`);
  for (const i of unassignedItems) log(`  rfq item    ${i.id}  "${i.name}"`);
  for (const s of unassignedIssues) log(`  service     ${s.id}  "${s.title}"`);

  // ---- 3. Suspect test/gibberish records ----------------------------------
  log("\n## 3. Suspect test/gibberish records (human review required - NOT an auto-delete list)\n");
  const [companies, contacts, opportunities, orders, lineItems] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true, email: true } }),
    prisma.contact.findMany({ select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.opportunity.findMany({ select: { id: true, title: true } }),
    prisma.order.findMany({ select: { id: true, title: true } }),
    prisma.lineItem.findMany({ select: { id: true, name: true } }),
  ]);
  for (const c of companies) {
    if (looksLikeGibberish(c.name) || isPlaceholderEmail(c.email)) {
      log(`  company     ${c.id}  "${c.name}"  ${c.email ?? ""}`);
    }
  }
  for (const c of contacts) {
    const full = `${c.firstName} ${c.lastName ?? ""}`.trim();
    if (looksLikeGibberish(full) || isPlaceholderEmail(c.email)) {
      log(`  contact     ${c.id}  "${full}"  ${c.email ?? ""}`);
    }
  }
  for (const o of opportunities) if (looksLikeGibberish(o.title)) log(`  deal        ${o.id}  "${o.title}"`);
  for (const o of orders) if (looksLikeGibberish(o.title)) log(`  order       ${o.id}  "${o.title}"`);
  for (const i of lineItems) if (looksLikeGibberish(i.name)) log(`  rfq item    ${i.id}  "${i.name}"`);

  // ---- 4. Stale August tasks still open -----------------------------------
  log("\n## 4. Stale August 2026 tasks still open\n");
  const augustTasks = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      createdAt: { gte: new Date("2026-08-01T00:00:00.000Z"), lt: new Date("2026-09-01T00:00:00.000Z") },
    },
    select: { id: true, title: true, status: true, assignee: { select: { name: true } } },
  });
  log(`Total: ${augustTasks.length}`);
  for (const t of augustTasks) {
    log(`  task        ${t.id}  "${t.title}"  status=${t.status}  owner=${t.assignee?.name ?? "unassigned"}`);
  }

  // ---- 5. Placeholder Phone Book entries ----------------------------------
  log("\n## 5. Phone Book entries with placeholder/incomplete details\n");
  for (const c of companies) {
    if (isPlaceholderEmail(c.email)) log(`  company     ${c.id}  "${c.name}"  email=${c.email}`);
  }
  for (const c of contacts) {
    if (isPlaceholderEmail(c.email)) {
      log(`  contact     ${c.id}  "${c.firstName} ${c.lastName ?? ""}"`.trimEnd() + `  email=${c.email}`);
    }
  }
  const noLastName = await prisma.contact.findMany({
    where: { OR: [{ lastName: null }, { lastName: "" }], email: null, phone: null },
    select: { id: true, firstName: true },
  });
  for (const c of noLastName) log(`  contact     ${c.id}  "${c.firstName}"  no last name, email, or phone on file`);

  // ---- 6. Orphaned service issues (no parent/link at all) -----------------
  log("\n## 6. Orphaned service issues (no company, location, order, or line item)\n");
  const orphanedIssues = await prisma.serviceIssue.findMany({
    where: { companyId: null, locationId: null, orderId: null, lineItemId: null },
    select: { id: true, title: true, status: true },
  });
  log(`Total: ${orphanedIssues.length}`);
  for (const s of orphanedIssues) log(`  service     ${s.id}  "${s.title}"  status=${s.status}`);

  log("\n" + "=".repeat(78));
  log("End of audit. Nothing above was changed. Next step per the spec:");
  log("back up the database, review this list, then quarantine/reassign with");
  log("named reasons - run this script again afterward and confirm zero hits");
  log("in sections 1-2 and a shrinking, human-confirmed list in section 3.");
  log("=".repeat(78));

  console.log(lines.join("\n"));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
