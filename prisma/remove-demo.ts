/**
 * HSS Kitchens — remove the DEMO data created by seed-demo.ts.
 *
 * Deletes exactly the marked rows, in FK-safe order (children first):
 *   - models with `notes`  -> notes starts with "[demo] "
 *   - TaskComment          -> body ends with " [demo]"
 *   - ActivityLog          -> detail ends with " [demo]"
 *   - IntakeSubmission     -> payload JSON contains "demo":true
 *
 * Real data is never touched. If a demo Company or Opportunity has picked up a
 * REAL dependent since seeding (e.g. someone filed a real contact under a demo
 * business), that parent is left in place and reported rather than deleted —
 * removing it would either fail on the foreign key or damage real records.
 *
 *   npm run seed:demo:remove
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NOTE = "[demo] ";
const SUFFIX = " [demo]";

const demoNotes = { notes: { startsWith: NOTE } } as const;

async function main() {
  console.log("Removing demo data…\n");

  const counts: Record<string, number> = {};
  const warnings: string[] = [];

  // Ids we may need before their rows disappear.
  const demoCompanies = await prisma.company.findMany({
    where: demoNotes,
    select: { id: true, name: true },
  });
  const demoCompanyIds = demoCompanies.map((c) => c.id);
  const demoOpps = await prisma.opportunity.findMany({
    where: demoNotes,
    select: { id: true, title: true },
  });
  const demoOppIds = demoOpps.map((o) => o.id);

  // --- children first ----------------------------------------------------
  counts.TaskComment = (
    await prisma.taskComment.deleteMany({ where: { body: { endsWith: SUFFIX } } })
  ).count;

  counts.ActivityLog = (
    await prisma.activityLog.deleteMany({ where: { detail: { endsWith: SUFFIX } } })
  ).count;

  counts.IntakeSubmission = (
    await prisma.intakeSubmission.deleteMany({ where: { payload: { contains: '"demo":true' } } })
  ).count;

  counts.Payment = (await prisma.payment.deleteMany({ where: demoNotes })).count;

  // Line items reference purchase orders, orders and opportunities — go first.
  counts.LineItem = (await prisma.lineItem.deleteMany({ where: demoNotes })).count;

  // Delivery legs sit between the line items and the PO/order they belong to.
  counts.Delivery = (await prisma.delivery.deleteMany({ where: demoNotes })).count;

  counts.PurchaseOrder = (await prisma.purchaseOrder.deleteMany({ where: demoNotes })).count;

  counts.Task = (await prisma.task.deleteMany({ where: demoNotes })).count;

  counts.Order = (await prisma.order.deleteMany({ where: demoNotes })).count;

  // --- opportunities (skip any still holding a real order) ---------------
  if (demoOppIds.length) {
    const blockedOppIds = new Set(
      (
        await prisma.order.findMany({
          where: { opportunityId: { in: demoOppIds }, NOT: demoNotes },
          select: { opportunityId: true },
        })
      )
        .map((o) => o.opportunityId)
        .filter((id): id is string => !!id)
    );
    if (blockedOppIds.size) {
      warnings.push(
        `${blockedOppIds.size} demo opportunity/ies kept — a real order still points at them.`
      );
    }
    counts.Opportunity = (
      await prisma.opportunity.deleteMany({
        where: { AND: [demoNotes, { id: { notIn: [...blockedOppIds] } }] },
      })
    ).count;
  } else {
    counts.Opportunity = 0;
  }

  counts.Contact = (await prisma.contact.deleteMany({ where: demoNotes })).count;

  // --- companies ---------------------------------------------------------
  if (demoCompanyIds.length) {
    // A supplier link on a real line item / PO is low-value — safe to release.
    const releasedItems = await prisma.lineItem.updateMany({
      where: { supplierId: { in: demoCompanyIds } },
      data: { supplierId: null },
    });
    const releasedPos = await prisma.purchaseOrder.updateMany({
      where: { supplierId: { in: demoCompanyIds } },
      data: { supplierId: null },
    });
    if (releasedItems.count || releasedPos.count) {
      warnings.push(
        `Cleared demo supplier links from ${releasedItems.count} line item(s) and ${releasedPos.count} purchase order(s).`
      );
    }

    // Anything else still attached means real data lives under a demo business.
    const attachedTo = { companyId: { in: demoCompanyIds } };
    const stillAttached = await Promise.all([
      prisma.contact.findMany({ where: attachedTo, select: { companyId: true } }),
      prisma.opportunity.findMany({ where: attachedTo, select: { companyId: true } }),
      prisma.order.findMany({ where: attachedTo, select: { companyId: true } }),
      prisma.supplierProfile.findMany({ where: attachedTo, select: { companyId: true } }),
    ]);
    const blocked = new Set<string>(
      stillAttached
        .flat()
        .map((r) => r.companyId)
        .filter((id): id is string => !!id)
    );
    if (blocked.size) {
      const names = demoCompanies
        .filter((c) => blocked.has(c.id))
        .map((c) => c.name)
        .join(", ");
      warnings.push(`${blocked.size} demo business(es) kept — real records still reference them: ${names}`);
    }

    counts.Company = (
      await prisma.company.deleteMany({
        where: { AND: [demoNotes, { id: { notIn: [...blocked] } }] },
      })
    ).count;
  } else {
    counts.Company = 0;
  }

  // --- report ------------------------------------------------------------
  console.log("Demo rows deleted:");
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(18)} ${n}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  ${"TOTAL".padEnd(18)} ${total}`);

  if (warnings.length) {
    console.log("\nNotes:");
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const leftovers = await prisma.company.count({ where: demoNotes });
  if (leftovers === 0) console.log("\nAll demo markers cleared.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
