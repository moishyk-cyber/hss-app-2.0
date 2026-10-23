import { STAGE_ASSIGNEE_KEYS } from "./stageAssignments";
import { FLOW_STEPS, type FlowStepKey } from "./ballInCourt";
import { saveNotificationRows } from "./notificationEmailQueue";
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
const ORDER_INCLUDE = { ...ORDER_BALL_INCLUDE, opportunity: { select: { salespersonId: true, createdById: true } } } satisfies Prisma.OrderInclude;
const DEAL_INCLUDE = { lineItems: true } satisfies Prisma.OpportunityInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type DealRow = Prisma.OpportunityGetPayload<{ include: typeof DEAL_INCLUDE }>;
type RecordNotice = { key: string; snapshot: NoticeSnapshot; title: string; href: string; isDeal: boolean; createdAt: Date; opportunityId?: string | null };

async function config(db: Db): Promise<Config> {
  const [users, settings, requirements] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true, active: true } }),
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
  const recipients = courtRecipients(ball.step, row.opportunity?.salespersonId ?? row.ownerId ?? row.createdById, conf.users, conf.settings);
  const gate = evaluatePaymentGate(order);
  const deposit = gate.requiredTotal != null && order.orderValue ? gate.requiredTotal < order.orderValue : order.orderType === "project";
  return { key: `order:${row.id}`, title: row.title, href: `/orders/${row.id}`, isDeal: false, createdAt: row.createdAt, opportunityId: row.opportunityId,
    snapshot: { step: ball.step, recipients: [...new Set(recipients)].sort(), pricingReady: false, salespersonIds: [], quoteReviewIds: [], billingKind: deposit ? "deposit" : "payment" } };
}

function dealNotice(row: DealRow, conf: Config): RecordNotice {
  const items = row.lineItems.filter(i => i.rfqStatus !== "removed");
  const ball = opportunityBall({ stage: row.stage, clientQuoteCreated: row.clientQuoteCreated, clientQuoteSent: row.clientQuoteSent, lineItems: items.map(i => ({ rfqStatus: i.rfqStatus, unitPrice: null })), intakeComplete: intakeIssues({ ...row, lineItems: items.map(i => ({ ...i, unitPrice: null })) }, conf.requirements).length === 0 });
  return { key: `opportunity:${row.id}`, title: row.title, href: `/pipeline/${row.id}`, isDeal: true, createdAt: row.createdAt,
    snapshot: { step: ball.step, recipients: courtRecipients(ball.step, row.salespersonId, conf.users, conf.settings), pricingReady: row.stage !== "lost" && items.length > 0 && items.every(itemHasQuote), salespersonIds: activeRecipients(row.salespersonId ? [row.salespersonId] : [], conf.users), quoteReviewIds: courtRecipients(ball.step, row.salespersonId, conf.users, conf.settings), billingKind: "payment" } };
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

/** Persist the same single assignment as the notice; mirror linked deals without changing sales ownership. */
async function saveAssignment(db: Db, record: RecordNotice) {
  const [kind, id] = record.key.split(":");
  const data = { courtStep: record.snapshot.step, courtAssigneeId: record.snapshot.recipients[0] ?? null };
  const changed = { OR: [{ courtStep: { not: data.courtStep } }, ...(data.courtStep ? [{ courtStep: null }] : []), { courtAssigneeId: { not: data.courtAssigneeId } }, ...(data.courtAssigneeId ? [{ courtAssigneeId: null }] : [])] };
  const where = { id, ...changed };
  if (kind === "order") {
    await db.order.updateMany({ where, data });
    if (record.opportunityId) await db.opportunity.updateMany({ where: { id: record.opportunityId, ...changed }, data });
  } else await db.opportunity.updateMany({ where, data });
}

/** One-time/repair baseline. Batched writes avoid 10,000 individual workflow transactions and send no historical alerts. */
export async function initializeStageAssignments(db: PrismaClient) {
  const conf = await config(db);
  const [deals, orders] = await Promise.all([
    db.opportunity.findMany({ where: { stage: { not: "won" } }, include: DEAL_INCLUDE }),
    db.order.findMany({ include: ORDER_INCLUDE }),
  ]);
  const records = [...deals.map(row => dealNotice(row, conf)), ...orders.map(row => orderNotice(row, conf))];
  const groups = new Map<string, RecordNotice[]>();
  for (const record of records) {
    const key = `${record.key.split(":")[0]}:${record.snapshot.step}:${record.snapshot.recipients[0] ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const data = { courtStep: group[0].snapshot.step, courtAssigneeId: group[0].snapshot.recipients[0] ?? null };
    const ids = group.map(record => record.key.split(":")[1]);
    if (group[0].isDeal) await db.opportunity.updateMany({ where: { id: { in: ids } }, data });
    else {
      await db.order.updateMany({ where: { id: { in: ids } }, data });
      await db.opportunity.updateMany({ where: { id: { in: group.flatMap(record => record.opportunityId ? [record.opportunityId] : []) } }, data });
    }
  }
  // Preserve versions while replacing old multi-recipient snapshots. No email/in-app flood on rollout.
  for (let start = 0; start < records.length; start += 250) {
    const batch = records.slice(start, start + 250);
    await serialTransaction(db, async tx => {
      const existing = await tx.notificationState.findMany({ where: { key: { in: batch.map(row => row.key) } } });
      const versions = new Map(existing.map(row => [row.key, row.version]));
      await tx.notificationState.deleteMany({ where: { key: { in: batch.map(row => row.key) } } });
      await tx.notificationState.createMany({ data: batch.map(record => ({ key: record.key, version: versions.get(record.key) ?? 0, snapshot: record.snapshot as Prisma.InputJsonValue })) });
    });
  }
  return { records: records.length };
}

/** A settings change hands off existing cards in bulk, with one notice per affected record. */
async function reassignConfiguredStage(db: PrismaClient, step: FlowStepKey) {
  await serialTransaction(db, async tx => {
    const conf = await config(tx);
    const assigneeId = courtRecipients(step, null, conf.users, conf.settings)[0] ?? null;
    const filter = { courtStep: step, OR: [{ courtAssigneeId: { not: assigneeId } }, ...(assigneeId ? [{ courtAssigneeId: null }] : [])] };
    const [deals, orders] = await Promise.all([
      tx.opportunity.findMany({ where: { ...filter, stage: { notIn: ["won", "lost"] } }, select: { id: true, title: true } }),
      tx.order.findMany({ where: { ...filter, status: { not: "complete" } }, select: { id: true, title: true, opportunityId: true } }),
    ]);
    const records = [...deals.map(row => ({ ...row, key: `opportunity:${row.id}` })), ...orders.map(row => ({ ...row, key: `order:${row.id}` }))];
    const states = await tx.notificationState.findMany({ where: { key: { in: records.map(row => row.key) } } });
    const stateByKey = new Map(states.map(row => [row.key, row]));
    const changed = records.flatMap(record => {
      const previous = stateByKey.get(record.key);
      if (!previous) return [];
      const snapshot = { ...previous.snapshot as NoticeSnapshot, recipients: assigneeId ? [assigneeId] : [] };
      return [{ record, previous, snapshot }];
    });
    const data = { courtAssigneeId: assigneeId };
    await tx.opportunity.updateMany({ where: { id: { in: [...deals.map(row => row.id), ...orders.flatMap(row => row.opportunityId ? [row.opportunityId] : [])] } }, data });
    await tx.order.updateMany({ where: { id: { in: orders.map(row => row.id) } }, data });
    await tx.notificationState.deleteMany({ where: { key: { in: changed.map(row => row.record.key) } } });
    await tx.notificationState.createMany({ data: changed.map(({ record, previous, snapshot }) => ({ key: record.key, version: previous.version + 1, snapshot: snapshot as Prisma.InputJsonValue })) });
    await saveNotificationRows(tx, changed.flatMap(({ record, previous, snapshot }) => planNotifications(previous.snapshot as NoticeSnapshot, snapshot, { title: record.title, href: `/records/${record.id}`, isDeal: false }).flatMap(notice => notice.recipientIds.map(userId => ({ userId, eventKey: `${record.key}:${previous.version + 1}:${notice.kind}`, kind: notice.kind, title: notice.title, message: notice.message, href: notice.href })))));
  });
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
        await saveAssignment(tx, record);
        const previous = await tx.notificationState.findUnique({ where: { key: record.key } });
        const snapshot = record.snapshot;
        if (previous && isDeepStrictEqual(previous.snapshot, snapshot)) return;
        const version = (previous?.version ?? 0) + 1;
        // Existing records are seeded before activation, never backfilled with old alerts.
        const emit = !!previous || record.createdAt >= conf.startedAt;
        const notices = emit ? planNotifications(previous ? previous.snapshot as NoticeSnapshot : null, snapshot, record) : [];
        await tx.notificationState.upsert({ where: { key: record.key }, create: { key: record.key, version, snapshot: snapshot as Prisma.InputJsonValue }, update: { version, snapshot: snapshot as Prisma.InputJsonValue } });
        const data = notices.flatMap(notice => notice.recipientIds.map(userId => ({ userId, eventKey: `${record.key}:${version}:${notice.kind}`, kind: notice.kind, title: notice.title, message: notice.message, href: notice.href, createdAt: now })));
        await saveNotificationRows(tx, data);
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
  const configuredStep = FLOW_STEPS.find(step => STAGE_ASSIGNEE_KEYS[step.key] === entry.linkedId);
  if (courtChanged && configuredStep && configuredStep.key !== "close") {
    await reassignConfiguredStage(db, configuredStep.key);
  } else if (courtChanged || teamChanged || requirementsChanged || accountChanged) {
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
  } else if (entry.linkedType === "task") {
    const task = await db.task.findUnique({ where: { id: entry.linkedId }, select: { assigneeId: true } });
    if (task?.assigneeId) await notifyDueTasks(db, task.assigneeId);
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
  const user = await db.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!user?.active) return;
  const tasks = await db.task.findMany({ where: { assigneeId: userId, status: { not: "done" }, dueDate: { lt: taskDueCutoff(now) } }, select: { id: true, title: true, dueDate: true } });
  if (!tasks.length) return;
  const data = tasks.map(task => dueTaskNotice(task, userId, now));
  await persistNewDueNotices(db, data);
}

/** Background reminders do not depend on an assignee opening the app. Batch all active users in one write. */
export async function notifyAllDueTasks(db: PrismaClient, now = new Date()) {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  if (!users.length) return;
  const tasks = await db.task.findMany({ where: { assigneeId: { in: users.map(user => user.id) }, status: { not: "done" }, dueDate: { lt: taskDueCutoff(now) } }, select: { id: true, title: true, dueDate: true, assigneeId: true } });
  if (!tasks.length) return;
  const data = tasks.map(task => dueTaskNotice(task, task.assigneeId!, now));
  await persistNewDueNotices(db, data);
}

/** Repeated browser polls must not open write transactions for already-delivered reminders. */
async function persistNewDueNotices(db: PrismaClient, data: ReturnType<typeof dueTaskNotice>[]) {
  const existing = await db.notification.findMany({ where: { userId: { in: [...new Set(data.map(row => row.userId))] }, eventKey: { in: data.map(row => row.eventKey) } }, select: { userId: true, eventKey: true } });
  const keys = new Set(existing.map(row => `${row.userId}:${row.eventKey}`));
  const fresh = data.filter(row => !keys.has(`${row.userId}:${row.eventKey}`));
  if (fresh.length) await serialTransaction(db, tx => saveNotificationRows(tx, fresh));
}

function dueTaskNotice(task: { id: string; title: string; dueDate: Date | null }, userId: string, now: Date) {
  const date = task.dueDate!.toISOString().slice(0, 10);
  return { userId, eventKey: `task:${task.id}:due:${date}:${userId}`, kind: "task_due", title: "Task due", message: `${task.title} is due ${date}. Review and update the task.`, href: `/tasks/${task.id}`, createdAt: now };
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
