"use server";
import { requirePermission } from "@/lib/permissionsServer";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { prisma } from "@/lib/prisma";
import { serialTransaction } from "@/lib/workflows/transaction";
import { addPartner, renamePartner } from "@/lib/workflows/deliveryPartners";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/log";

export async function addDeliveryPartner(kind: string, raw: string, deliveryId?: string): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  if (kind !== "carriers" && kind !== "truckers") return { ok: false, message: "Choose carriers or truckers." };
  if (!raw.trim() || raw.trim().length > 200) return { ok: false, message: "Enter a name of 1–200 characters." };
  return safeAction(async () => {
    const orderId = await serialTransaction(prisma, tx => addPartner(tx, kind, raw, deliveryId));
    await logActivity("settings", "delivery-partners", "delivery_partner_added", `${kind === "carriers" ? "Carrier" : "Trucker"} added: ${raw.trim()}`);
    revalidatePath("/carriers-truckers", "layout");
    revalidatePath("/deliveries", "layout");
    if (orderId) {
      await logActivity("order", orderId, "delivery_partner_set", `${kind === "carriers" ? "Carrier" : "Trucker"} set to ${raw.trim()} from the shared list`);
      revalidatePath(`/orders/${orderId}`);
    }
    revalidatePath("/orders", "layout");
  }, "Could not save the name. Please try again.");
}

export async function renameDeliveryPartner(kind: string, original: string, name: string): Promise<ActionResult> {
  const denied = await requirePermission("deliveries.edit");
  if (denied) return denied;
  if (kind !== "carriers" && kind !== "truckers") return { ok: false, message: "Choose carriers or truckers." };
  if (!name.trim() || name.trim().length > 200) return { ok: false, message: "Enter a name of 1–200 characters." };
  try {
    await serialTransaction(prisma, tx => renamePartner(tx, kind, original, name));
    await logActivity("settings", "delivery-partners", "delivery_partner_renamed", `${original.trim()} renamed to ${name.trim()} (${kind})`);
    revalidatePath("/carriers-truckers", "layout");
    revalidatePath("/deliveries", "layout");
    revalidatePath("/orders", "layout");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error && ["That name already exists. Choose a different name.", "This name no longer exists. Refresh the list."].includes(error.message) ? error.message : "Could not rename this entry. Please try again.";
    return { ok: false, message };
  }
}
