// Server-side half of the pre-auth identity: reads the cookie mirrored by
// identityClient.ts. Both halves must agree on IDENTITY_COOKIE.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const IDENTITY_COOKIE = "hss_user_id";

export async function currentUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(IDENTITY_COOKIE)?.value || null;
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
