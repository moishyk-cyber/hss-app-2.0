// One-time data cleanup (Moishy, Aug 31): the demo/seed records carry em dashes
// in titles and notes ("Sabra Grill — kitchen buildout"). The UI banned the
// character; this brings the data in line by replacing every em dash with a
// plain hyphen. Safe to re-run. Run: npx tsx --tsconfig tsconfig.json scripts/clean-emdash-data.ts

import { prisma } from "@/lib/prisma";

const EM = "—";

/** model delegate name -> string fields worth sweeping */
const TARGETS: Record<string, string[]> = {
  company: ["name", "notes", "deliveryAddress", "billingAddress", "locationName"],
  contact: ["firstName", "lastName", "title", "notes"],
  opportunity: ["title", "notes", "lostReason", "clientVisionNotes", "menu", "facilityType"],
  lineItem: ["name", "description", "moreDetails", "brand", "notes"],
  order: ["title", "notes", "deliveryAddress"],
  purchaseOrder: ["notes"],
  delivery: ["notes", "trucker", "pickupAddress"],
  payment: ["notes"],
  task: ["title", "notes"],
  taskComment: ["body"],
  activityLog: ["detail"],
};

async function main() {
  let total = 0;
  for (const [model, fields] of Object.entries(TARGETS)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    for (const field of fields) {
      const rows: { id: string; [k: string]: string | null }[] = await delegate.findMany({
        where: { [field]: { contains: EM } },
        select: { id: true, [field]: true },
      });
      for (const row of rows) {
        const next = (row[field] as string).split(EM).join("-");
        await delegate.update({ where: { id: row.id }, data: { [field]: next } });
        total += 1;
        console.log(`${model}.${field} ${row.id}: "${row[field]}" -> "${next}"`);
      }
    }
  }
  console.log(`Done. ${total} field value(s) cleaned.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
