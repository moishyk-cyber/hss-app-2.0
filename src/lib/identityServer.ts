// Server-side identity. Backed by the signed login session (src/lib/session.ts)
// set at /login - not the old plain "hss_user_id" cookie, which was only ever
// a display-only mirror anyone could edit in devtools.

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const currentUserId = cache(async (): Promise<string | null> => {
  try {
    const store = await cookies();
    return await verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
});

/** One database lookup shared by the layout and page within this render only.
 * Keep failures distinct from a missing user so an outage does not log users out.
 */
export const sessionUser = cache(async () => {
  const id = await currentUserId();
  if (!id) return { user: null, verified: false };
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, active: true },
    });
    return { user, verified: true };
  } catch {
    return { user: null, verified: false };
  }
});

/** Name for activity-log attribution. */
export async function currentUserName(): Promise<string> {
  return (await sessionUser()).user?.name ?? "Team";
}

/** Invalidated accounts log out; database outages do not. */
export async function sessionUserIsGone(): Promise<boolean> {
  const { user, verified } = await sessionUser();
  return verified && (!user || !user.active);
}
