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
