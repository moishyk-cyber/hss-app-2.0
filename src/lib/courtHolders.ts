// Ball-in-court holders: which role (and optionally one or more specific
// people) sit in each pipeline stage's court right now. Settings-backed, with
// shipped defaults baked in here (not the DB) so every badge reads sensibly
// before an admin configures anything (Sep 4 client decision: "in the
// settings we need to set the roles = ball in court"; later split to one row
// per stage with a multi-person pin).

import { prisma } from "@/lib/prisma";
import { getSettings, type SettingKey } from "@/lib/settings";
import { USER_ROLES, labelFor } from "@/lib/constants";
import { isRole, type Role } from "@/lib/permissions";
import { FLOW_STEPS, type Ball, type FlowStepKey } from "@/lib/ballInCourt";

/**
 * Shipped defaults - who normally sits in each stage's court until an admin
 * says otherwise from Admin > Settings. Mirrors each step's team (see
 * FLOW_STEPS' `court`); Sam runs purchasing and service today, so both
 * default to the purchasing role.
 */
const DEFAULT_STEP_ROLES: Record<FlowStepKey, Role> = {
  sales: "sales",
  pricing: "purchasing",
  close: "sales",
  quote: "purchasing",
  terms: "sales",
  deposit: "billing",
  pos: "purchasing",
  delivery: "purchasing",
  service: "purchasing",
};

const STEPS_LIST = FLOW_STEPS.map((s) => s.key);

const STEP_SETTING_KEYS: Record<FlowStepKey, { role: SettingKey; userIds: SettingKey }> = {
  sales: { role: "court.sales.role", userIds: "court.sales.userIds" },
  pricing: { role: "court.pricing.role", userIds: "court.pricing.userIds" },
  close: { role: "court.close.role", userIds: "court.close.userIds" },
  quote: { role: "court.quote.role", userIds: "court.quote.userIds" },
  terms: { role: "court.terms.role", userIds: "court.terms.userIds" },
  deposit: { role: "court.deposit.role", userIds: "court.deposit.userIds" },
  pos: { role: "court.pos.role", userIds: "court.pos.userIds" },
  delivery: { role: "court.delivery.role", userIds: "court.delivery.userIds" },
  service: { role: "court.service.role", userIds: "court.service.userIds" },
};

export type StageHolder = { role: Role | null; userIds: string[]; userNames: string[] };
export type StageHolders = Record<FlowStepKey, StageHolder>;

/** Parse the comma-separated userIds setting value into a clean id list. */
function parseUserIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * One settings read (all eighteen keys) plus one users read (the distinct
 * pinned ids, active only) per page. Falls back to the shipped default role -
 * and no pinned people - for any stage left unset; never throws (an
 * unreachable table reads the same as unset, same as getSettings/getSetting).
 */
export async function getStageHolders(): Promise<StageHolders> {
  const keys = STEPS_LIST.flatMap((s) => [STEP_SETTING_KEYS[s].role, STEP_SETTING_KEYS[s].userIds]);
  const settings = await getSettings(keys);

  const pending: Record<FlowStepKey, { role: Role; userIds: string[] }> = {} as Record<
    FlowStepKey,
    { role: Role; userIds: string[] }
  >;
  const allUserIds = new Set<string>();
  for (const s of STEPS_LIST) {
    const roleValue = settings[STEP_SETTING_KEYS[s].role];
    const role = isRole(roleValue) ? roleValue : DEFAULT_STEP_ROLES[s];
    const userIds = parseUserIds(settings[STEP_SETTING_KEYS[s].userIds]);
    pending[s] = { role, userIds };
    for (const id of userIds) allUserIds.add(id);
  }

  const users = allUserIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...allUserIds] }, active: true },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const holders = {} as StageHolders;
  for (const s of STEPS_LIST) {
    const { role, userIds } = pending[s];
    // Pinned ids that no longer resolve (deactivated/deleted users) drop out,
    // same as if nobody had been pinned there.
    const resolvedIds = userIds.filter((id) => nameById.has(id));
    holders[s] = {
      role,
      userIds: resolvedIds,
      userNames: resolvedIds.map((id) => nameById.get(id)!),
    };
  }
  return holders;
}

/** The pinned people's names if any, else the role label, else the step name. */
export function holderLabel(step: FlowStepKey, holders: StageHolders): string {
  const h = holders[step];
  if (h.userNames.length > 0) return h.userNames.join(", ");
  if (h.role) return labelFor(USER_ROLES, h.role);
  return FLOW_STEPS.find((s) => s.key === step)?.label ?? step;
}

/** Copy of a ball with its holder filled in from the current stage holders. */
export function withHolder(ball: Ball, holders: StageHolders): Ball {
  if (!ball.step) return ball;
  return { ...ball, holder: holderLabel(ball.step, holders) };
}
