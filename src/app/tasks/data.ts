import { prisma } from "@/lib/prisma";

export async function resolveLinkedLabels(pairs: { type: string; id: string }[]): Promise<Map<string, string>> {
  const byType: Record<string, string[]> = {};
  for (const p of pairs) {
    (byType[p.type] ??= []).push(p.id);
  }
  const map = new Map<string, string>();
  const [opps, orders, items, companies, contacts] = await Promise.all([
    byType.opportunity?.length
      ? prisma.opportunity.findMany({ where: { id: { in: byType.opportunity } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    byType.order?.length
      ? prisma.order.findMany({ where: { id: { in: byType.order } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    byType.line_item?.length
      ? prisma.lineItem.findMany({ where: { id: { in: byType.line_item } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    byType.company?.length
      ? prisma.company.findMany({ where: { id: { in: byType.company } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    byType.contact?.length
      ? prisma.contact.findMany({
          where: { id: { in: byType.contact } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);
  opps.forEach((o) => map.set(`opportunity:${o.id}`, o.title));
  orders.forEach((o) => map.set(`order:${o.id}`, o.title));
  items.forEach((i) => map.set(`line_item:${i.id}`, i.name));
  companies.forEach((c) => map.set(`company:${c.id}`, c.name));
  contacts.forEach((c) => map.set(`contact:${c.id}`, `${c.firstName} ${c.lastName ?? ""}`.trim()));
  return map;
}
