"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity, type ActivityLogMeta } from "@/lib/log";
import { isValidValue, USER_ROLES } from "@/lib/constants";
import { requirePermission } from "@/lib/permissionsServer";
import { currentUserId } from "@/lib/identityServer";
import { openWorkForUser, reassignAllOpenWork } from "@/lib/ownership";
import { hashPassword } from "@/lib/password";

async function log(linkedId: string, action: string, detail: string, meta?: ActivityLogMeta) {
  await logActivity("user", linkedId, action, detail, meta);
}

function refresh() {
  revalidatePath("/admin/team");
}

const EDITABLE_FIELDS = ["name", "email", "role"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function isEditableField(value: unknown): value is EditableField {
  return typeof value === "string" && (EDITABLE_FIELDS as readonly string[]).includes(value);
}

/** Emails are stored trimmed and lowercased, matching how /login looks them up. */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Basic shape only: something@something.something, no spaces. */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Case-insensitive, so rows saved before emails were normalized still count as taken. */
async function emailTaken(email: string, exceptId?: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
}

/** True when this user is an active admin and nobody else is. */
async function isLastActiveAdmin(id: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true, active: true } });
  if (!user || !user.active || user.role !== "admin") return false;
  const otherAdmins = await prisma.user.count({ where: { role: "admin", active: true, NOT: { id } } });
  return otherAdmins === 0;
}

const LAST_ADMIN_MESSAGE = "This is the last active admin. Make someone else an admin first.";

/** Friendly refusal when a deactivation would lock the team out, or null when it's fine. */
async function deactivationBlocked(id: string): Promise<ActionResult | null> {
  if (id === (await currentUserId())) {
    return { ok: false, message: "You can't deactivate yourself. Ask another admin to do it." };
  }
  if (await isLastActiveAdmin(id)) return { ok: false, message: LAST_ADMIN_MESSAGE };
  return null;
}

/** Reassignment moves records that show up on every one of these lists/queues. */
function revalidateReassignedSurfaces() {
  revalidatePath("/admin/team");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/orders");
  revalidatePath("/rfq");
  revalidatePath("/tasks");
  revalidatePath("/service");
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "").trim() || "sales";
  if (!name || !email) return { ok: false, message: "Name and email are required." };
  if (!looksLikeEmail(email)) return { ok: false, message: "That doesn't look like an email address." };
  if (!isValidValue(USER_ROLES, role)) return { ok: false, message: "Not a valid role." };

  const existing = await emailTaken(email);
  if (existing) return { ok: false, message: "Someone with that email already exists." };

  return safeAction(async () => {
    const user = await prisma.user.create({ data: { name, email, role } });
    await log(user.id, "user_created", `Added teammate ${name} (${role})`);
    refresh();
  }, "Could not add the teammate. Please try again.");
}

export async function updateUserField(
  id: string,
  field: "name" | "email" | "role",
  value: string
): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  // The TS type isn't enforced over the wire: a client can send any string, and
  // anything else (passwordHash, active, ...) must never reach the update below.
  if (!isEditableField(field)) return { ok: false, message: "That field can't be edited here." };
  if (typeof value !== "string") return { ok: false, message: "Not a valid value." };
  const trimmed = field === "email" ? normalizeEmail(value) : value.trim();
  if ((field === "name" || field === "email") && !trimmed) {
    return { ok: false, message: `${field === "name" ? "Name" : "Email"} can't be empty.` };
  }
  if (field === "email" && !looksLikeEmail(trimmed)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }
  if (field === "role" && !isValidValue(USER_ROLES, trimmed)) {
    return { ok: false, message: "Not a valid role." };
  }
  if (field === "role" && trimmed !== "admin" && (await isLastActiveAdmin(id))) {
    return { ok: false, message: LAST_ADMIN_MESSAGE };
  }
  if (field === "email") {
    const existing = await emailTaken(trimmed, id);
    if (existing) return { ok: false, message: "Someone else already uses that email." };
  }

  return safeAction(async () => {
    const before = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true, role: true } });
    const data = field === "name" ? { name: trimmed } : field === "email" ? { email: trimmed } : { role: trimmed };
    await prisma.user.update({ where: { id }, data });
    await log(id, "user_updated", `Updated ${field}`, {
      previousValue: before ? before[field] : null,
      newValue: trimmed,
    });
    refresh();
  }, "Could not update the teammate. Please try again.");
}

/**
 * Reliability spec P0-4: deactivation can no longer silently strand open work
 * on someone nobody can see anymore. Going inactive with open work attached is
 * rejected outright - the caller has to go through deactivateAndReassign
 * instead, which moves the work and flips the flag in one transaction.
 */
export async function setUserActive(id: string, active: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  const isActive = active === "active";
  if (!isActive) {
    const blocked = await deactivationBlocked(id);
    if (blocked) return blocked;
    const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
    if (!user) return { ok: false, message: "Teammate not found." };
    const openWork = await openWorkForUser(id);
    if (openWork.total > 0) {
      return {
        ok: false,
        message: `${user.name} still owns ${openWork.total} open item${
          openWork.total === 1 ? "" : "s"
        }. Use "Deactivate and reassign" to move it first.`,
      };
    }
  }
  return safeAction(async () => {
    await prisma.user.update({ where: { id }, data: { active: isActive } });
    await log(id, "user_status_changed", isActive ? "Reactivated" : "Deactivated", {
      previousValue: isActive ? "inactive" : "active",
      newValue: isActive ? "active" : "inactive",
    });
    refresh();
  }, "Could not update the teammate's status. Please try again.");
}

/**
 * The atomic path when a departing teammate DOES own open work: every open
 * opportunity/order/task/RFQ item/service issue they hold moves to an active
 * successor, then they go inactive - in one transaction, so there is no
 * in-between state where the work is visible to nobody.
 */
export async function deactivateAndReassign(id: string, successorId: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  if (!successorId) return { ok: false, message: "Pick who takes over their open work." };
  if (successorId === id) return { ok: false, message: "Pick someone other than the teammate being deactivated." };
  const blocked = await deactivationBlocked(id);
  if (blocked) return blocked;
  return safeAction(async () => {
    const [user, successor] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: successorId }, select: { name: true, active: true } }),
    ]);
    if (!user) throw new Error("Teammate not found");
    if (!successor || !successor.active) throw new Error("Pick an active teammate to take over the work");

    const moved = await reassignAllOpenWork(id, successorId);
    await prisma.user.update({ where: { id }, data: { active: false } });
    await log(
      id,
      "user_deactivated_with_reassignment",
      `${user.name} deactivated - ${moved.total} open item(s) (${moved.opportunities} deal(s), ${moved.orders} order(s), ${moved.tasks} task(s), ${moved.lineItems} RFQ item(s), ${moved.serviceIssues} service issue(s)) reassigned to ${successor.name}`,
      { previousValue: "active", newValue: "inactive" }
    );
    revalidateReassignedSurfaces();
  }, "Could not deactivate and reassign. Please try again.");
}

/** Sets or resets a teammate's login password. They use it at /login going forward. */
export async function setUserPassword(id: string, newPassword: string): Promise<ActionResult> {
  const denied = await requirePermission("admin.manage");
  if (denied) return denied;
  if (newPassword.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  return safeAction(async () => {
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await log(id, "user_password_set", "Password set");
    refresh();
  }, "Could not set the password. Please try again.");
}
