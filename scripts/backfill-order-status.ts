// One-time backfill: re-derive Order.status for every existing order under the
// derived-status rules in src/lib/flow.ts. Existing orders were set by hand and
// need truing up once; after this, the app keeps statuses in sync on every mutation.
// Run: npx tsx --tsconfig tsconfig.json scripts/backfill-order-status.ts
// Safe to re-run; recomputeOrderStatus skips "stuck" and "complete".

import { prisma } from "@/lib/prisma";
import { recomputeOrderStatus } from "@/lib/flow";

async function main() {
  const orders = await prisma.order.findMany({ select: { id: true, title: true, status: true } });
  let changed = 0;
  for (const order of orders) {
    const next = await recomputeOrderStatus(order.id);
    if (next && next !== order.status) {
      console.log(`${order.title} (${order.id}): ${order.status} -> ${next}`);
      changed += 1;
    }
  }
  console.log(`Done. ${changed}/${orders.length} orders updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
