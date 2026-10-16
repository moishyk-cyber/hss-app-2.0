"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissionsServer";
import { logActivity } from "@/lib/log";
import { deleteIntakeRecord, deleteIntakeItem, IntakeDeletionError } from "@/lib/workflows/intakeDeletion";
import type { ActionResult } from "@/lib/actionResult";

export async function deleteSavedIntake(kind: "opportunity" | "order", id: string): Promise<ActionResult> {
  const denied = await requirePermission(kind === "opportunity" ? "deals.edit" : "orders.edit");
  if (denied) return denied;
  try {
    await deleteIntakeRecord(prisma, kind, id);
    await logActivity(kind, id, "intake_deleted", "Intake and its unfulfilled items deleted; attachment and activity history retained.");
    for (const path of ["/pipeline", "/orders", "/rfq", "/dashboard"]) revalidatePath(path);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof IntakeDeletionError ? error.message : "Could not delete this intake. Refresh and try again." };
  }
}

export async function deleteSavedIntakeItem(id: string): Promise<ActionResult> {
  const before = await prisma.lineItem.findUnique({ where: { id }, select: { orderId: true, opportunityId: true } });
  const denied = await requirePermission(before?.orderId ? "orders.edit" : "deals.edit");
  if (denied) return denied;
  try {
    const item = await deleteIntakeItem(prisma, id);
    await logActivity(item.opportunityId ? "opportunity" : "order", item.opportunityId ?? item.orderId!, "intake_item_deleted", `Deleted item: ${item.name} (qty ${item.qty})`);
    for (const path of ["/pipeline", "/orders", "/rfq", "/dashboard", ...(item.opportunityId ? [`/pipeline/${item.opportunityId}`] : []), ...(item.orderId ? [`/orders/${item.orderId}`] : [])]) revalidatePath(path);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof IntakeDeletionError ? error.message : "Could not delete this item. Refresh and try again." };
  }
}
