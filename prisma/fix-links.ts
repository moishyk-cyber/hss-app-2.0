// Applies monday board_relation links (hss_relations.json) after seed.ts runs.
// monday's API returns board_relation values only via a typed fragment, so the
// main export (hss_items.json) has them empty — this file patches the FKs.
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

type RelItem = { id: string; column_values: Array<{ id?: string; linked_item_ids?: string[] }> };
type RelBoard = { id: string; items_page: { items: RelItem[] } };

async function main() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "monday-export", "hss_relations.json"), "utf8")
  );
  const boards: RelBoard[] = raw.data.boards;

  const byMonday = async (model: "company" | "contact" | "opportunity" | "order" | "lineItem", mondayId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = prisma[model];
    return m.findUnique({ where: { mondayId }, select: { id: true } });
  };

  let applied = 0;
  const link = async (
    sourceModel: "contact" | "opportunity" | "order" | "lineItem",
    sourceMondayId: string,
    field: string,
    targetModel: "company" | "contact" | "opportunity" | "order",
    targetMondayId: string
  ) => {
    const src = await byMonday(sourceModel, sourceMondayId);
    const tgt = await byMonday(targetModel, targetMondayId);
    if (!src || !tgt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = prisma[sourceModel];
    await m.update({ where: { id: src.id }, data: { [field]: tgt.id } });
    applied++;
  };

  for (const board of boards) {
    for (const item of board.items_page.items) {
      for (const cv of item.column_values) {
        const ids = cv.linked_item_ids ?? [];
        if (!cv.id || ids.length === 0) continue;
        const first = ids[0];
        switch (`${board.id}:${cv.id}`) {
          // Contacts → Company
          case "18364381955:contact_account":
            await link("contact", item.id, "companyId", "company", first);
            break;
          // Opportunities → Company / Contact; reverse: its line items & orders
          case "18364381920:board_relation_mm5w17am":
            await link("opportunity", item.id, "companyId", "company", first);
            break;
          case "18364381920:deal_contact":
            await link("opportunity", item.id, "primaryContactId", "contact", first);
            break;
          case "18364381920:board_relation_mm5wd874":
            for (const li of ids) await link("lineItem", li, "opportunityId", "opportunity", item.id);
            break;
          case "18364381920:board_relation_mm5v2v0p":
            for (const o of ids) await link("order", o, "opportunityId", "opportunity", item.id);
            break;
          // Sales line items → Opportunity
          case "18424782380:board_relation_mm59nm91":
            await link("lineItem", item.id, "opportunityId", "opportunity", first);
            break;
          // Orders → Company / Contact / Opportunity; reverse: its line items
          case "18424782388:board_relation_mm5xs2e0":
            await link("order", item.id, "companyId", "company", first);
            break;
          case "18424782388:board_relation_mm5xmc3":
            await link("order", item.id, "contactId", "contact", first);
            break;
          case "18424782388:board_relation_mm5vez4r":
            await link("order", item.id, "opportunityId", "opportunity", first);
            break;
          case "18424782388:board_relation_mm5x88gc":
            for (const li of ids) await link("lineItem", li, "orderId", "order", item.id);
            break;
          // Order line items → Order
          case "18425103394:board_relation_mm5xp8h2":
            await link("lineItem", item.id, "orderId", "order", first);
            break;
        }
      }
    }
  }
  console.log(`fix-links: applied ${applied} relation links`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
