import { headers } from "next/headers";

/**
 * In-memory login throttle with exponential backoff.
 *
 * Keyed separately by lowercase email and by client IP (the first hop of
 * `x-forwarded-for`, when the request provides one), so a single leaked
 * email doesn't let an attacker lock other people out, and a single IP
 * can't hammer many emails unnoticed. After 5 failed attempts for a key
 * within a 15 minute window, further attempts for that key are refused
 * until the block cools down. Each additional failure past the threshold
 * doubles the block, capped at 1 hour. A successful login clears the
 * counters for both keys, and stale entries are pruned opportunistically
 * on each call so the map doesn't grow without bound.
 *
 * Caveat: on Vercel (or any multi-instance/serverless deployment) this
 * state lives per lambda instance - it is not shared across instances and
 * is reset on cold start, so it is best-effort, not a guarantee. The
 * robust complement is a Vercel Firewall rate-limit rule on POST /login,
 * which is enforced at the edge across every instance regardless of which
 * one handles a given request.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000; // failures must fall within this window to count together
const BASE_BLOCK_MS = 60 * 1000; // first block once the threshold is hit: 1 minute
const MAX_BLOCK_MS = 60 * 60 * 1000; // block duration is capped here regardless of streak length
const STALE_AFTER_MS = WINDOW_MS + MAX_BLOCK_MS; // entries idle longer than this are pruned

interface ThrottleEntry {
  count: number;
  windowStart: number;
  blockUntil: number;
  lastSeen: number;
}

const attempts = new Map<string, ThrottleEntry>();

function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.lastSeen > STALE_AFTER_MS) attempts.delete(key);
  }
}

function minutesLabel(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export interface ThrottleCheck {
  allowed: boolean;
  message?: string;
}

function checkKey(key: string, now: number): ThrottleCheck {
  const entry = attempts.get(key);
  if (!entry || entry.blockUntil <= now) return { allowed: true };
  return {
    allowed: false,
    message: `Too many failed attempts. Try again in ${minutesLabel(entry.blockUntil - now)}.`,
  };
}

function recordFailureForKey(key: string, now: number): void {
  let entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now, blockUntil: 0, lastSeen: now };
  }
  entry.count += 1;
  entry.lastSeen = now;
  if (entry.count >= MAX_FAILURES) {
    const backoffSteps = entry.count - MAX_FAILURES;
    const blockMs = Math.min(BASE_BLOCK_MS * 2 ** backoffSteps, MAX_BLOCK_MS);
    entry.blockUntil = now + blockMs;
  }
  attempts.set(key, entry);
}

/** Checks whether a login attempt for this email/IP pair is currently allowed. */
export function checkLoginThrottle(email: string, ip: string | null): ThrottleCheck {
  const now = Date.now();
  prune(now);
  const byEmail = checkKey(`email:${email.toLowerCase()}`, now);
  if (!byEmail.allowed) return byEmail;
  if (ip) {
    const byIp = checkKey(`ip:${ip}`, now);
    if (!byIp.allowed) return byIp;
  }
  return { allowed: true };
}

/** Records a failed login attempt for this email/IP pair. */
export function recordLoginFailure(email: string, ip: string | null): void {
  const now = Date.now();
  recordFailureForKey(`email:${email.toLowerCase()}`, now);
  if (ip) recordFailureForKey(`ip:${ip}`, now);
}

/** Clears the throttle counters for this email/IP pair after a successful login. */
export function clearLoginThrottle(email: string, ip: string | null): void {
  attempts.delete(`email:${email.toLowerCase()}`);
  if (ip) attempts.delete(`ip:${ip}`);
}

/** Reads the client's IP from the first hop of x-forwarded-for, if the request set it. */
export async function getClientIp(): Promise<string | null> {
  const store = await headers();
  const forwardedFor = store.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  return first || null;
}
