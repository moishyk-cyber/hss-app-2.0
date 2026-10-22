import type { Prisma, PrismaClient } from "@prisma/client";
import { EMAIL_START_KEY } from "./notificationEmailQueue";
import { notificationEmailConfig, notificationEmailPayload, ResendDeliveryError, sendResendEmail, type EmailPayload, type NotificationEmailConfig } from "./resendEmail";

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;
type Options = {
  config?: NotificationEmailConfig | null;
  limit?: number;
  now?: () => Date;
  send?: typeof sendResendEmail;
  pause?: () => Promise<void>;
  maxMs?: number;
};

/** Lease one job per worker; freeze the exact payload and reuse Resend's idempotency key on every retry. */
export async function dispatchNotificationEmails(db: PrismaClient, options: Options = {}) {
  const config = options.config === undefined ? notificationEmailConfig() : options.config;
  const stats = { configured: !!config, sent: 0, retried: 0, skipped: 0, failed: 0, uncertain: 0 };
  if (!config) return stats;
  const now = options.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(options.limit ?? 3, 25));
  const deadline = Date.now() + (options.maxMs ?? 18000);
  const start = now();
  const jobs = await db.notificationEmail.findMany({ where: { OR: [
    { status: "pending", availableAt: { lte: start } },
    { status: "sending", leaseUntil: { lt: start } },
  ] }, include: { notification: { include: { user: { select: { active: true, email: true } } } } }, orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: limit });
  for (const job of jobs) {
    if (Date.now() >= deadline) break;
    const time = now();
    const notice = job.notification;
    const prior = { id: job.id, status: job.status, attempts: job.attempts, leaseUntil: job.leaseUntil };
    if (!notice?.user.active || notice.user.email.trim() !== job.recipient) {
      const changed = await db.notificationEmail.updateMany({ where: prior, data: { status: "skipped", leaseUntil: null, lastError: "recipient_inactive_or_changed" } });
      stats.skipped += changed.count; continue;
    }
    if (job.firstAttemptAt && time.getTime() - job.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) {
      const changed = await db.notificationEmail.updateMany({ where: prior, data: { status: "uncertain", leaseUntil: null, lastError: "retry_window_expired_check_resend_before_retrying" } });
      stats.uncertain += changed.count; continue;
    }
    if (!job.firstAttemptAt && time.getTime() - job.createdAt.getTime() >= 24 * 60 * 60 * 1000) {
      const changed = await db.notificationEmail.updateMany({ where: prior, data: { status: "skipped", lastError: "notification_expired" } });
      stats.skipped += changed.count; continue;
    }
    let payload: EmailPayload;
    try { payload = job.payload ? job.payload as unknown as EmailPayload : notificationEmailPayload(config, notice, job.recipient); }
    catch {
      await db.notificationEmail.updateMany({ where: prior, data: { status: "failed", lastError: "invalid_notification_payload" } });
      stats.failed++; continue;
    }
    const token = crypto.randomUUID();
    const attempts = job.attempts + 1;
    const claimed = await db.notificationEmail.updateMany({ where: prior, data: {
      status: "sending", attempts, attemptToken: token, leaseUntil: new Date(time.getTime() + LEASE_MS),
      firstAttemptAt: job.firstAttemptAt ?? time, payload: payload as unknown as Prisma.InputJsonValue,
    } });
    if (!claimed.count) continue;
    const owned = { id: job.id, status: "sending", attemptToken: token };
    try {
      const resendId = await (options.send ?? sendResendEmail)(config, payload, `hss-notification/${job.notificationId}`);
      await db.notificationEmail.updateMany({ where: owned, data: { status: "sent", resendId, sentAt: now(), leaseUntil: null, lastError: null } });
      stats.sent++;
    } catch (error) {
      const problem = error instanceof ResendDeliveryError ? error : new ResendDeliveryError(true, "delivery_or_recording_uncertain");
      const retry = problem.retryable && attempts < MAX_ATTEMPTS;
      const backoff = Math.max(problem.retryAfterMs, Math.min(1800000, 30000 * 2 ** (attempts - 1)));
      const status = retry ? "pending" : problem.code.includes("uncertain") ? "uncertain" : "failed";
      await db.notificationEmail.updateMany({ where: owned, data: { status, availableAt: new Date(now().getTime() + backoff), leaseUntil: null, lastError: problem.code } });
      if (retry) stats.retried++; else if (status === "uncertain") stats.uncertain++; else stats.failed++;
    }
    // Stay within Resend's baseline request rate; another worker is still protected by job leases/idempotency.
    await (options.pause ?? (() => new Promise<void>(resolve => setTimeout(resolve, 550))))();
  }
  return stats;
}

/** Activate future notifications only. Re-running never requeues old inbox history. */
export async function initializeNotificationEmails(db: PrismaClient, config: NotificationEmailConfig | null = notificationEmailConfig(), now = new Date()) {
  if (!config) throw new Error("Set RESEND_API_KEY, NOTIFICATION_EMAIL_FROM and HTTPS APP_URL before enabling email notifications.");
  await db.appSetting.upsert({ where: { key: EMAIL_START_KEY }, create: { key: EMAIL_START_KEY, value: now.toISOString() }, update: {} });
}
