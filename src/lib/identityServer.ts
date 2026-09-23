// Server-side identity. Backed by the signed login session (src/lib/session.ts)
// set at /login - not the old plain "hss_user_id" cookie, which was only ever
// a display-only mirror anyone could edit in devtools.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function currentUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    return await verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

/** Name for activity-log attribution. "Team" when nobody has picked an identity. */
export async function currentUserName(): Promise<string> {
  const id = await currentUserId();
  if (!id) return "Team";
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
    return user?.name ?? "Team";
  } catch {
    return "Team";
  }
}

/**
 * True when the session cookie verifies but the user it names is deleted or
 * inactive, i.e. the session should be thrown away. False when there is no
 * session (proxy.ts already sends those to /login) and when the database
 * can't be reached, so a blip doesn't sign everyone out.
 */
export async function sessionUserIsGone(): Promise<boolean> {
  const id = await currentUserId();
  if (!id) return false;
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { active: true } });
    return !user || !user.active;
  } catch {
    return false;
  }
}
