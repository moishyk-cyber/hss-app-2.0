export type NotificationEmailConfig = { apiKey: string; from: string; appUrl: string };
export type EmailPayload = { from: string; to: string[]; subject: string; html: string; text: string };
export function notificationEmailConfig(env: Record<string, string | undefined> = process.env): NotificationEmailConfig | null {
  if (env.BULK_TEST_MODE === 'true' || (appMode(env) === 'dev' && env.NOTIFICATION_EMAIL_ENABLED !== 'true')) return null;
  if (env.NOTIFICATION_EMAIL_ENABLED === "false") return null;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFICATION_EMAIL_FROM?.trim();
  const rawUrl = (appMode(env) === 'dev' ? env.TEST_APP_URL || env.APP_URL : env.APP_URL)?.trim();
  if (!apiKey || !from || !rawUrl || /[\r\n]/.test(from) || !/^[^<>]*<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$|^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { apiKey, from, appUrl: url.origin };
  } catch { return null; }
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}
export function notificationEmailPayload(config: NotificationEmailConfig, notice: { title: string; message: string; href: string }, recipient: string): EmailPayload {
  if (notice.href !== "/notifications" && !/^\/(pipeline|orders|tasks)\/[^/\s?#]+(?:#[a-z-]+)?$/.test(notice.href)) throw new Error("Invalid notification link");
  const url = new URL(notice.href, config.appUrl).href;
  const title = escapeHtml(notice.title);
  const message = escapeHtml(notice.message);
  return {
    from: config.from, to: [recipient], subject: `HSS Kitchens — ${notice.title.replace(/[\r\n]/g, " ").slice(0, 160)}`,
    text: `${notice.title}\n\n${notice.message}\n\nOpen in HSS Kitchens: ${url}\n\nYou received this update because this work is assigned to you or your team.`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f7f6f3;font-family:Arial,sans-serif;color:#202020"><main style="max-width:560px;margin:32px auto;padding:28px;background:#ffffff;border:1px solid #e5e3de;border-radius:12px"><p style="font-size:14px;font-weight:bold;margin:0 0 24px">HSS Kitchens</p><h1 style="font-size:22px;line-height:1.35;margin:0 0 16px">${title}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 24px">${message}</p><p style="margin:0 0 28px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#202020;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open in HSS Kitchens</a></p><p style="font-size:12px;line-height:1.5;color:#66645e;margin:0">You received this update because this work is assigned to you or your team.</p></main></body></html>`,
  };
}

export class ResendDeliveryError extends Error {
  constructor(readonly retryable: boolean, readonly code: string, readonly retryAfterMs = 0) { super(code); }
}
export async function sendResendEmail(config: NotificationEmailConfig, payload: EmailPayload, key: string, transport: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await transport("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
  } catch { throw new ResendDeliveryError(true, "resend_connection_uncertain"); }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || response.status === 409;
    const delay = Number(response.headers.get("retry-after"));
    throw new ResendDeliveryError(retryable, `resend_http_${response.status}`, Number.isFinite(delay) ? Math.min(3600, Math.max(0, delay)) * 1000 : 0);
  }
  let body: { id?: unknown };
  try { body = await response.json(); } catch { throw new ResendDeliveryError(true, "resend_response_uncertain"); }
  if (typeof body.id !== "string" || !body.id) throw new ResendDeliveryError(true, "resend_response_uncertain");
  return body.id;
}
import { appMode } from './environmentMode';
