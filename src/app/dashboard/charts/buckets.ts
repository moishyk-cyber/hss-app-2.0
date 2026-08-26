// Zero-filled time-bucket builders for the trend charts.

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function weekLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short" });
}

/** Zero-filled weekly counts, ending at the current week. */
export function buildWeeklyCounts(dates: Date[], weeks: number, now: Date): { label: string; value: number }[] {
  const end = startOfWeek(now);
  const buckets = Array.from({ length: weeks }, (_, idx) => {
    const i = weeks - 1 - idx;
    const start = new Date(end);
    start.setDate(start.getDate() - i * 7);
    return { start, label: weekLabel(start), value: 0 };
  });
  for (const d of dates) {
    const ws = startOfWeek(d).getTime();
    const bucket = buckets.find((b) => b.start.getTime() === ws);
    if (bucket) bucket.value += 1;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

/** Zero-filled monthly sums (or counts), ending at the current month. */
export function buildMonthlyBuckets(
  items: { date: Date; amount?: number }[],
  months: number,
  now: Date,
  mode: "sum" | "count"
): { label: string; value: number }[] {
  const base = monthStart(now);
  const buckets = Array.from({ length: months }, (_, idx) => {
    const i = months - 1 - idx;
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    return { key: monthKey(d), label: monthLabel(d), value: 0 };
  });
  for (const it of items) {
    const key = monthKey(monthStart(it.date));
    const b = buckets.find((x) => x.key === key);
    if (!b) continue;
    b.value += mode === "sum" ? it.amount ?? 0 : 1;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

/** Zero-filled monthly two-series counts (project vs order mix). */
export function buildMonthlyMix(
  items: { date: Date; type: string }[],
  months: number,
  now: Date,
  aType: string
): { label: string; a: number; b: number }[] {
  const base = monthStart(now);
  const buckets = Array.from({ length: months }, (_, idx) => {
    const i = months - 1 - idx;
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    return { key: monthKey(d), label: monthLabel(d), a: 0, b: 0 };
  });
  for (const it of items) {
    const key = monthKey(monthStart(it.date));
    const b = buckets.find((x) => x.key === key);
    if (!b) continue;
    if (it.type === aType) b.a += 1;
    else b.b += 1;
  }
  return buckets.map(({ label, a, b }) => ({ label, a, b }));
}
