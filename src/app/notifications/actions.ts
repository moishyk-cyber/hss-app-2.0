"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/permissionsServer";
import { prisma } from "@/lib/prisma";
import { markNotificationsRead } from "@/lib/notifications";
import type { ActionResult } from "@/lib/actionResult";

export async function readNotification(id?: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in to update notifications." };
  if (id !== undefined && (typeof id !== "string" || !id || id.length > 100)) return { ok: false, message: "Choose a notification." };
  try {
    await markNotificationsRead(prisma, user.id, id);
    revalidatePath("/notifications");
    return { ok: true };
  } catch { return { ok: false, message: "Could not mark notifications read. Please retry." }; }
}
