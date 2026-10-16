import { isDeepStrictEqual } from "node:util";
import type { Prisma, PrismaClient } from "@prisma/client";
import { orderCanClose, intakeIssues } from "./dealWorkflow";
import { ORDER_BALL_INCLUDE, orderBallInput } from "./flow";
import { orderBall, opportunityBall, itemHasQuote, type OrderBallInput } from "./ballInCourt";
import { plainMoney } from "./money";
import { evaluatePaymentGate } from "./flowRules";
import { serialTransaction } from "./workflows/transaction";
import { activeRecipients, courtRecipients, planNotifications, taskDueCutoff, type NoticeSnapshot, type NotificationUser } from "./notificationRules";

type Db = Prisma.TransactionClient;
type Config = { users: NotificationUser[]; settings: Record<string, string>; startedAt: Date; requirements: { company: boolean; neededBy: boolean } };
const START_KEY = "notifications.startedAt";
const ORDER_INCLUDE = { ...ORDER_BALL_INCLUDE, opportunity: { select: { salespersonId: true } } } satisfies Prisma.OrderInclude;
const DEAL_INCLUDE = { lineItems: true } satisfies Prisma.OpportunityInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type DealRow = Prisma.OpportunityGetPayload<{ include: typeof DEAL_INCLUDE }>;
type RecordNotice = { key: string; snapshot: NoticeSnapshot; title: string; href: string; isDeal: boolean; createdAt: Date };

async function config(db: Db): Promise<Config> {
  const [users, settings, requirements] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, role: true, active: true } }),
    db.appSetting.findMany({ where: { OR: [{ key: { startsWith: "court." } }, { key: "pricing.defaultAssigneeId" }, { key: START_KEY }] } }),
    db.fieldRequirement.findMany({ where: { entity: "opportunity" } }),
  ]);
  const values = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return { users, settings: values, startedAt: new Date(values[START_KEY] || "9999-01-01"), requirements: { company: requirements.find(r => r.field === "companyId")?.required ?? true, neededBy: requirements.find(r => r.field === "neededByDate")?.required ?? true } };
}

function orderNotice(row: OrderRow, conf: Config): RecordNotice {
  const order = plainMoney(row);
  const facts: OrderBallInput = orderBallInput(order);
  const ball = orderBall(order.status === "complete" && !orderCanClose(facts) ? { ...facts, status: "delivered" } : facts);
  const recipients = courtRecipients(ball.step, row.opportunity?.salespersonId ?? row.ownerId, conf.users, conf.settings);
  if (ball.step === "deposit") recipients.push(...conf.users.filter(u => u.role === "billing").map(u => u.id));
  const gate = evaluatePaymentGate(order);
  const deposit = gate.requiredTotal != null && order.orderValue ? gate.requiredTotal < order.orderValue : order.orderType === "project";
  return { key: `order:${row.id}`, title: row.title, href: `/orders/${row.id}`, isDeal: false, createdAt: row.createdAt,
    snapshot: { step: ball.step, recipients: [...new Set(recipients)].sort(), pricingReady: false, salespersonIds: [], quoteReviewIds: [], billingKind: deposit ? "deposit" : "payment" } };
}

function dealNotice(row: DealRow, conf: Config): RecordNotice {
  const items = row.lineItems.filter(i => i.rfqStatus !== "removed");
  const ball = opportunityBall({ stage: row.stage, lineItems: items.map(i => ({ rfqStatus: i.rfqStatus, unitPrice: null })), intakeComplete: intakeIssues({ ...row, lineItems: items.map(i => ({ ...i, unitPrice: null })) }, conf.requirements).length === 0 });
  const assignees = activeRecipients(items.flatMap(i => i.assigneeId ? [i.assigneeId] : []), conf.users);
  const defaultAssignee = activeRecipients([conf.settings["pricing.defaultAssigneeId"] ?? ""], conf.users);
  return { key: `opportunity:${row.id}`, title: row.title, href: `/pipeline/${row.id}`, isDeal: true, createdAt: row.createdAt,
    snapshot: { step: ball.step, recipients: courtRecipients(ball.step, row.salespersonId, conf.users, conf.settings), pricingReady: row.stage !== "lost" && items.length > 0 && items.every(itemHasQuote), salespersonIds: activeRecipients(row.salespersonId ? [row.salespersonId] : [], conf.users), quoteReviewIds: assignees.length ? assignees : defaultAssignee.length ? defaultAssignee : courtRecipients("pricing", null, conf.users, conf.settings), billingKind: "payment" } };
}

async function loadRecord(db: Db, kind: string, id: string, conf: Config): Promise<RecordNotice | null> {
  if (kind === "opportunity") {
    const deal = await db.opportunity.findUnique({ where: { id }, include: DEAL_INCLUDE });
    if (!deal) return null;
    if (deal.stage === "won") {
      const order = await db.order.findFirst({ where: { opportunityId: id }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" } });
      return order ? orderNotice(order, conf) : null;
    }
    return dealNotice(deal, conf);
  }
  if (kind === "order") {
    const order = await db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return order ? orderNotice(order, conf) : null;
  }
  if (kind === "line_item") {
    const item = await db.lineItem.findUnique({ where: { id }, select: { opportunityId: true, orderId: true } });
    return item?.orderId ? loadRecord(db, "order", item.orderId, conf) : item?.opportunityId ? loadRecord(db, "opportunity", item.opportunityId, conf) : null;
  }
  if (kind === "service_issue") {
    const item = await db.serviceIssue.findUnique({ where: { id }, select: { orderId: true } });
    return item?.orderId ? loadRecord(db, "order", item.orderId, conf) : null;
  }
  return null;
}

/** Save the workflow snapshot and all recipient deliveries atomically. Serializable retries prevent duplicate handoffs. */
export async function syncRecordNotifications(db: PrismaClient, kind: string, id: string, now = new Date()) {
  if (!["opportunity", "order", "line_item", "service_issue"].includes(kind)) return;
  for (let attempt = 0; ; attempt++) {
    try {
      return await serialTransaction(db, async tx => {
        const conf = await config(tx);
        const record = await loadRecord(tx, kind, id, conf);
        if (!record) return;
        const previous = await tx.notificationState.findUnique({ where: { key: record.key } });
        const snapshot = record.snapshot;
        if (previous && isDeepStrictEqual(previous.snapshot, snapshot)) return;
        const version = (previous?.version ?? 0) + 1;
        // Existing records are seeded before activation, never backfilled with old alerts.
        const emit = !!previous || record.createdAt >= conf.startedAt;
        const notices = emit ? planNotifications(previous ? previous.snapshot as NoticeSnapshot : null, snapshot, record) : [];
        await tx.notificationState.upsert({ where: { key: record.key }, create: { key: record.key, version, snapshot: snapshot as Prisma.InputJsonValue }, update: { version, snapshot: snapshot as Prisma.InputJsonValue } });
        const data = notices.flatMap(notice => notice.recipientIds.map(userId => ({ userId, eventKey: `${record.key}:${version}:${notice.kind}`, kind: notice.kind, title: notice.title, message: notice.message, href: notice.href, createdAt: now })));
        if (data.length) await tx.notification.createMany({ data, skipDuplicates: true });
      });
    } catch (error) {
      // Two workers can first observe a brand-new record simultaneously.
      if (attempt >= 2 || !(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
    }
  }
}

/** The existing activity log doubles as a durable retry queue for failed notification processing. */
export async function processNotificationActivity(db: PrismaClient, entry: { id: string; linkedType: string; linkedId: string; action?: string }) {
  const courtChanged = entry.linkedType === "setting" && (entry.linkedId.startsWith("court.") || entry.action === "court_holder_changed");
  const teamChanged = entry.linkedType === "user" && ["user_created", "user_updated", "user_status_changed", "user_deleted", "user_deactivated_with_reassignment"].includes(entry.action ?? "");
  const requirementsChanged = entry.linkedType === "field_requirement" && entry.linkedId.startsWith("opportunity.");
  const accountChanged = entry.linkedType === "company" && entry.action === "company_updated";
  if (courtChanged || teamChanged || requirementsChanged || accountChanged) {
    const company = accountChanged ? { companyId: entry.linkedId } : {};
    const [deals, orders] = await Promise.all([
      db.opportunity.findMany({ where: { stage: { notIn: ["won", "lost"] }, ...company }, select: { id: true } }),
      db.order.findMany({ where: { status: { not: "complete" }, ...company }, select: { id: true } }),
    ]);
    const records = [...deals.map(record => ({ kind: "opportunity", id: record.id })), ...orders.map(record => ({ kind: "order", id: record.id }))];
    let cursor = 0;
    const errors: unknown[] = [];
    await Promise.all(Array.from({ length: Math.min(4, records.length) }, async () => {
      while (cursor < records.length) {
        const record = records[cursor++];
        try { await syncRecordNotifications(db, record.kind, record.id); }
        catch (error) { errors.push(error); }
      }
    }));
    if (errors.length) throw errors[0];
  } else await syncRecordNotifications(db, entry.linkedType, entry.linkedId);
  await db.activityLog.update({ where: { id: entry.id }, data: { notificationProcessedAt: new Date() } });
}

export async function retryNotificationActivity(db: PrismaClient) {
  const started = await db.appSetting.findUnique({ where: { key: START_KEY } });
  if (!started) return;
  const entries = await db.activityLog.findMany({ where: { notificationProcessedAt: null, at: { gte: new Date(started.value) } }, orderBy: [{ at: "asc" }, { id: "asc" }], take: 5 });
  for (const entry of entries) await processNotificationActivity(db, entry);
}

export async function notifyDueTasks(db: PrismaClient, userId: string, now = new Date()) {
  const tasks = await db.task.findMany({ where: { assigneeId: userId, status: { not: "done" }, dueDate: { lt: taskDueCutoff(now) } }, select: { id: true, title: true, dueDate: true } });
  if (!tasks.length) return;
  await db.notification.createMany({ data: tasks.map(task => ({ userId, eventKey: `task:${task.id}:due:${task.dueDate!.toISOString().slice(0, 10)}:${userId}`, kind: "task_due", title: "Task due", message: `${task.title} is due ${task.dueDate!.toISOString().slice(0, 10)}. Review and update the task.`, href: `/tasks/${task.id}`, createdAt: now })), skipDuplicates: true });
}

/** Deployment bootstrap: establish current facts before enabling new event delivery. Idempotent. */
export async function initializeNotifications(db: PrismaClient, now = new Date()) {
  if (await db.appSetting.findUnique({ where: { key: START_KEY } })) return;
  const conf = await config(db);
  const [deals, orders] = await Promise.all([
    db.opportunity.findMany({ include: DEAL_INCLUDE }),
    db.order.findMany({ include: ORDER_INCLUDE }),
  ]);
  const records = [...deals.filter(d => d.stage !== "won").map(d => dealNotice(d, conf)), ...orders.map(o => orderNotice(o, conf))];
  await db.$transaction(async tx => {
    await tx.notificationState.createMany({ data: records.map(record => ({ key: record.key, snapshot: record.snapshot as Prisma.InputJsonValue })), skipDuplicates: true });
    await tx.activityLog.updateMany({ where: { at: { lt: now } }, data: { notificationProcessedAt: now } });
    await tx.appSetting.upsert({ where: { key: START_KEY }, create: { key: START_KEY, value: now.toISOString() }, update: {} });
  });
}

export async function markNotificationsRead(db: PrismaClient, userId: string, id?: string) {
  return db.notification.updateMany({ where: { userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}
