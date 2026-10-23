// Key/value app settings (AppSetting table): the default customer-service
// assignee, ball-in-court holders, and similar one-off knobs. Keys are typed
// here so a typo can't silently create a new setting.

import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = [
  "account.ownerId",
  "court.sales.assigneeId",
  "court.pricing.assigneeId",
  "court.clientQuote.assigneeId",
  "court.close.assigneeId",
  "court.deposit.assigneeId",
  "court.pos.assigneeId",
  "court.delivery.assigneeId",
  "court.service.assigneeId",

  "service.defaultAssigneeId",
  "pricing.defaultAssigneeId",
  // "off" enforces the role matrix; anything else (unset included) means open
  // mode: every role can do everything. Open by default (Sep 3: "open it up
  // for everyone until I tell you otherwise").
  "permissions.openMode",
  // Historical keys retained for compatibility. Current assignment resolution
  // uses only the single-person court.<step>.assigneeId keys above.
  "court.sales.role",
  "court.sales.userIds",
  "court.pricing.role",
  "court.pricing.userIds",
  "court.close.role",
  "court.close.userIds",
  "court.clientQuote.role",
  "court.clientQuote.userIds",
  "court.terms.role",
  "court.terms.userIds",
  "court.salesOrder.role",
  "court.salesOrder.userIds",
  "court.deposit.role",
  "court.deposit.userIds",
  "court.pos.role",
  "court.pos.userIds",
  "court.delivery.role",
  "court.delivery.userIds",
  "court.service.role",
  "court.service.userIds",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];



/** One setting, or null when unset. Never throws (a missing table reads as unset). */
export async function getSetting(key: SettingKey): Promise<string | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch (err) {
    console.error(`getSetting(${key}) failed`, err);
    return null;
  }
}

/** Several settings in one query; every requested key is present (null when unset). */
export async function getSettings<K extends SettingKey>(keys: readonly K[]): Promise<Record<K, string | null>> {
  const result = Object.fromEntries(keys.map((k) => [k, null])) as Record<K, string | null>;
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: [...keys] } } });
    for (const row of rows) {
      if (keys.includes(row.key as K)) result[row.key as K] = row.value;
    }
  } catch (err) {
    console.error("getSettings failed", err);
  }
  return result;
}

/** Upsert a setting. An empty value removes the row so getSetting reads null again. Throws on failure. */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: trimmed },
    update: { value: trimmed },
  });
}
