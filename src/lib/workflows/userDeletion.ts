import type { PrismaClient } from "@prisma/client";
import type { ActionResult } from "../actionResult";
import { RFQ_QUEUE_STATUSES } from "../../app/rfq/queue-statuses";
import { serialTransaction } from "./transaction";

/** Remove the login record while retaining business records and historical attribution. */
export async function deleteTeamMember(db: PrismaClient, id: string, actorId: string | null): Promise<ActionResult> {
  return serialTransaction(db, async (tx): Promise<ActionResult> => {
    const actor = actorId ? await tx.user.findUnique({ where: { id: actorId } }) : null;
    if (!actor?.active || actor.role !== "admin") {
      return { ok: false, message: "Only a signed-in admin can delete a teammate." };
    }
    if (id === actorId) return { ok: false, message: "You can't delete your own account. Ask another admin to do it." };
    const owner = await tx.appSetting.findUnique({ where: { key: "account.ownerId" } });
    if (!owner?.value) return { ok: false, message: "Choose an account owner before deleting teammates." };
    if (id === owner.value) return { ok: false, message: "The account owner cannot be deleted." };
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) return { ok: false, message: "Teammate not found. Refresh the team list." };
    if (user.active && user.role === "admin" && await tx.user.count({ where: { role: "admin", active: true } }) <= 1) {
      return { ok: false, message: "This is the last active admin. Make someone else an admin first." };
    }

    const counts = await Promise.all([
      tx.opportunity.count({ where: { salespersonId: id, stage: { notIn: ["won", "lost"] } } }),
      tx.order.count({ where: { ownerId: id, status: { not: "complete" } } }),
      tx.task.count({ where: { assigneeId: id, status: { not: "done" } } }),
      tx.lineItem.count({ where: { assigneeId: id, rfqStatus: { in: RFQ_QUEUE_STATUSES.map((s) => s.value) } } }),
      tx.serviceIssue.count({ where: { assigneeId: id, status: { in: ["open", "in_progress"] } } }),
    ]);
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total > 0) {
      return { ok: false, message: `${user.name} still owns ${total} open item${total === 1 ? "" : "s"}. Use "reassign & deactivate" before deleting them.` };
    }

    // Backfill missing name snapshots before detaching historical links.
    await tx.taskComment.updateMany({ where: { authorId: id, authorName: null }, data: { authorName: user.name } });
    await tx.activityLog.updateMany({ where: { userId: id, userName: null }, data: { userName: user.name } });
    await tx.taskComment.updateMany({ where: { authorId: id }, data: { authorId: null } });
    await tx.activityLog.updateMany({ where: { userId: id }, data: { userId: null } });
    await tx.opportunity.updateMany({ where: { salespersonId: id }, data: { salespersonId: null } });
    await tx.order.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
    await tx.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
    await tx.lineItem.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
    await tx.serviceIssue.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });

    const settings = await tx.appSetting.findMany();
    for (const setting of settings) {
      if (["service.defaultAssigneeId", "pricing.defaultAssigneeId"].includes(setting.key) && setting.value === id) {
        await tx.appSetting.delete({ where: { key: setting.key } });
      } else if (setting.key.startsWith("court.") && setting.key.endsWith(".userIds")) {
        const ids = setting.value.split(",").map((value) => value.trim()).filter(Boolean);
        if (ids.includes(id)) {
          await tx.appSetting.update({ where: { key: setting.key }, data: { value: ids.filter((value) => value !== id).join(",") } });
        }
      }
    }
    await tx.user.delete({ where: { id } });
    await tx.activityLog.create({ data: {
      userId: actor.id, userName: actor.name, linkedType: "user", linkedId: id,
      action: "user_deleted", detail: `Deleted teammate ${user.name} (${user.email}); business records and history retained`,
      previousValue: JSON.stringify({ name: user.name, email: user.email, role: user.role, active: user.active }),
      newValue: null, sourceScreen: "/admin/team",
    } });
    return { ok: true };
  });
}
