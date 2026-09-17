import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ListControls } from "@/lib/ListControls";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { ACTIVITY_RECORD_TYPES, activityRecordTypeLabel, activityRecordHref } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type AuditSearchParams = { page?: string } & Record<string, string | string[] | undefined>;

/**
 * Reliability spec P0-2: one place Admin can see every state-changing action
 * across the app, filterable by date/actor/record type/record id/action, with
 * append-only rows (this page has no edit or delete controls by design).
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const sp = await searchParams;

  const actorOptions = (
    await prisma.activityLog.findMany({
      where: { userName: { not: null } },
      distinct: ["userName"],
      select: { userName: true },
      orderBy: { userName: "asc" },
      take: 200,
    })
  )
    .map((r) => r.userName)
    .filter((n): n is string => Boolean(n))
    .map((n) => ({ value: n, label: n }));

  const recordTypeOptions = Object.entries(ACTIVITY_RECORD_TYPES).map(([value, label]) => ({ value, label }));

  const FIELDS: ListField[] = [
    { key: "actor", label: "Actor", type: "enum", options: actorOptions },
    { key: "recordType", label: "Record type", type: "enum", options: recordTypeOptions },
    { key: "recordId", label: "Record ID", type: "text" },
    { key: "action", label: "Action", type: "text" },
    { key: "at", label: "Date", type: "date" },
  ];
  const { filters } = parseListQuery(FIELDS, sp);

  const where: Prisma.ActivityLogWhereInput = {};
  if (filters.actor) where.userName = filters.actor;
  if (filters.recordType) where.linkedType = filters.recordType;
  if (filters.recordId) where.linkedId = { contains: filters.recordId, mode: "insensitive" };
  if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };
  if (filters.at) {
    const day = new Date(`${filters.at}T00:00:00.000Z`);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    where.at = { gte: day, lt: nextDay };
  }

  const page = Math.max(1, Number(sp.page) || 1);
  const [total, entries] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || typeof v !== "string" || v === "") continue;
      params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const query = params.toString();
    return query ? `/admin/audit?${query}` : "/admin/audit";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Audit Log</h1>
        <p className="page-sub">
          Every state-changing action across the app: actor, timestamp, record, and what changed. Append-only -
          nothing here can be edited or deleted.
        </p>
      </div>

      <ListControls fields={FIELDS} />

      {entries.length === 0 ? (
        <div className="empty-state">No activity matches those filters.</div>
      ) : (
        <div className="card card-flush overflow-hidden overflow-x-auto">
          <table className="table-klyne min-w-[900px]">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Record</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Changed</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const href = activityRecordHref(e.linkedType, e.linkedId);
                return (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap text-xs text-gray-dark">{fmtDateTime(e.at)}</td>
                    <td className="whitespace-nowrap">{e.userName ?? <span className="empty-value">system</span>}</td>
                    <td className="whitespace-nowrap">
                      {href ? (
                        <Link href={href} className="text-blue transition-colors hover:underline">
                          {activityRecordTypeLabel(e.linkedType)}
                        </Link>
                      ) : (
                        activityRecordTypeLabel(e.linkedType)
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs text-gray-dark">{e.action}</td>
                    <td className="max-w-md text-sm text-gray-dark">{e.detail}</td>
                    <td className="whitespace-nowrap text-xs text-gray">
                      {e.previousValue != null || e.newValue != null
                        ? `${e.previousValue ?? "(none)"} → ${e.newValue ?? "(none)"}`
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-dark">
          <span>
            Page {page} of {totalPages} ({total} entries)
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn btn-sm">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="btn btn-sm">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
