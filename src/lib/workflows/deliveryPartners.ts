import type { Prisma } from "@prisma/client";

export type PartnerKind = "carriers" | "truckers";
export type DeliveryPartners = { carriers: string[]; truckers: string[] };
export function partnerNames(...groups: (string | null | undefined)[][]): string[] {
  const names = new Map<string, string>();
  for (const raw of groups.flat()) {
    const name = raw?.trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
export function savedPartnerNames(value?: string | null): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? partnerNames(parsed.filter((name): name is string => typeof name === "string")) : [];
}
/** Called inside the same serializable transaction as the delivery save. */
export async function rememberPartner(db: Prisma.TransactionClient, kind: PartnerKind, raw: string) {
  const name = raw.trim();
  if (!name || name.length > 200) throw new Error("Enter a name of 1–200 characters.");
  const key = `delivery.${kind}`;
  const row = await db.appSetting.findUnique({ where: { key } });
  const names = savedPartnerNames(row?.value);
  if (names.some(value => value.toLowerCase() === name.toLowerCase())) return;
  const value = JSON.stringify(partnerNames(names, [name]));
  if (row) await db.appSetting.update({ where: { key }, data: { value } });
  else await db.appSetting.create({ data: { key, value } });
}
export async function rememberDeliveryPartners(db: Prisma.TransactionClient, carrier?: string | null, trucker?: string | null) {
  if (carrier?.trim()) await rememberPartner(db, "carriers", carrier);
  if (trucker?.trim()) await rememberPartner(db, "truckers", trucker);
}

/** Rename the shared entry and its delivery references atomically. */
export async function renamePartner(db: Prisma.TransactionClient, kind: PartnerKind, original: string, raw: string) {
  const name = raw.trim(), previous = original.trim();
  if (!name || name.length > 200 || !previous) throw new Error("Enter a name of 1–200 characters.");
  const key = `delivery.${kind}`;
  const row = await db.appSetting.findUnique({ where: { key } });
  const names = savedPartnerNames(row?.value);
  const where = kind === "carriers" ? { trackingCarrier: { equals: previous, mode: "insensitive" as const } } : { trucker: { equals: previous, mode: "insensitive" as const } };
  const target = kind === "carriers" ? { trackingCarrier: { equals: name, mode: "insensitive" as const } } : { trucker: { equals: name, mode: "insensitive" as const } };
  if (!names.some(n => n.toLowerCase() === previous.toLowerCase()) && !await db.delivery.count({ where })) throw new Error("This name no longer exists. Refresh the list.");
  if (previous.toLowerCase() !== name.toLowerCase() &&
    (names.some(n => n.toLowerCase() === name.toLowerCase()) || await db.delivery.count({ where: target }))) throw new Error("That name already exists. Choose a different name.");
  const value = JSON.stringify(partnerNames(names.filter(n => n.toLowerCase() !== previous.toLowerCase()), [name]));
  if (row) await db.appSetting.update({ where: { key }, data: { value } });
  else await db.appSetting.create({ data: { key, value } });
  await db.delivery.updateMany({ where, data: kind === "carriers" ? { trackingCarrier: name } : { trucker: name } });
}

/** Create from the directory or a delivery picker, saving the selection together. */
export async function addPartner(db: Prisma.TransactionClient, kind: PartnerKind, name: string, deliveryId?: string) {
  const delivery = deliveryId ? await db.delivery.findUnique({ where: { id: deliveryId }, select: { orderId: true } }) : null;
  if (deliveryId && !delivery) throw new Error("Delivery not found");
  await rememberPartner(db, kind, name);
  if (deliveryId) await db.delivery.update({ where: { id: deliveryId }, data: kind === "carriers" ? { trackingCarrier: name.trim() } : { trucker: name.trim() } });
  return delivery?.orderId;
}
