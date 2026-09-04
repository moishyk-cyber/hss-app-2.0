// Ball-in-court holders: which role (and optionally one specific person) sits
// in each court right now. Settings-backed, with shipped defaults baked in
// here (not the DB) so every badge reads sensibly before an admin configures
// anything (Sep 4 client decision: "in the settings we need to set the roles
// = ball in court").

import { prisma } from "@/lib/prisma";
import { getSettings, type SettingKey } from "@/lib/settings";
import { USER_ROLES, labelFor } from "@/lib/constants";
import { isRole, type Role } from "@/lib/permissions";
import { COURTS, type Ball, type Court } from "@/lib/ballInCourt";

/**
 * Shipped defaults - who normally sits in each court until an admin says
 * otherwise from Admin > Settings. Sam runs purchasing and service today, so
 * both default to the purchasing role.
 */
const DEFAULT_COURT_ROLES: Record<Court, Role> = {
  sales: "sales",
  office: "purchasing",
  billing: "billing",
  purchasing: "purchasing",
  service: "purchasing",
};

const COURTS_LIST = Object.keys(DEFAULT_COURT_ROLES) as Court[];

const COURT_SETTING_KEYS: Record<Court, { role: SettingKey; userId: SettingKey }> = {
  sales: { role: "court.sales.role", userId: "court.sales.userId" },
  office: { role: "court.office.role", userId: "court.office.userId" },
  billing: { role: "court.billing.role", userId: "court.billing.userId" },
  purchasing: { role: "court.purchasing.role", userId: "court.purchasing.userId" },
  service: { role: "court.service.role", userId: "court.service.userId" },
};

export type CourtHolder = { role: Role | null; userId: string | null; userName: string | null };
export type CourtHolders = Record<Court, CourtHolder>;

/**
 * One settings read (all ten keys) plus one users read (the distinct pinned
 * ids, active only) per page. Falls back to the shipped default role - and no
 * pinned person - for any court left unset; never throws (an unreachable
 * table reads the same as unset, same as getSettings/getSetting).
 */
export async function getCourtHolders(): Promise<CourtHolders> {
  const keys = COURTS_LIST.flatMap((c) => [COURT_SETTING_KEYS[c].role, COURT_SETTING_KEYS[c].userId]);
  const settings = await getSettings(keys);

  const pending: Record<Court, { role: Role; userId: string | null }> = {} as Record<
    Court,
    { role: Role; userId: string | null }
  >;
  const userIds = new Set<string>();
  for (const c of COURTS_LIST) {
    const roleValue = settings[COURT_SETTING_KEYS[c].role];
    const role = isRole(roleValue) ? roleValue : DEFAULT_COURT_ROLES[c];
    const userId = settings[COURT_SETTING_KEYS[c].userId] || null;
    pending[c] = { role, userId };
    if (userId) userIds.add(userId);
  }

  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] }, active: true },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const holders = {} as CourtHolders;
  for (const c of COURTS_LIST) {
    const { role, userId } = pending[c];
    // A pinned id that no longer resolves (deactivated/deleted user) falls
    // back to the role, same as if nobody had been pinned.
    const resolvedUserId = userId && nameById.has(userId) ? userId : null;
    holders[c] = { role, userId: resolvedUserId, userName: resolvedUserId ? nameById.get(resolvedUserId)! : null };
  }
  return holders;
}

/** The person's name if one is pinned, else the role label, else the court name. */
export function holderLabel(court: Court, holders: CourtHolders): string {
  const h = holders[court];
  if (h.userName) return h.userName;
  if (h.role) return labelFor(USER_ROLES, h.role);
  return COURTS[court];
}

/** Copy of a ball with its holder filled in from the current court holders. */
export function withHolder(ball: Ball, holders: CourtHolders): Ball {
  if (!ball.court) return ball;
  return { ...ball, holder: holderLabel(ball.court, holders) };
}
