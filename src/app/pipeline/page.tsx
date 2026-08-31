import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KanbanBoard, type KanbanCard } from "./KanbanBoard";
import { PipelineList } from "./PipelineList";
import { PageHeader, StageBadge, daysSince, fmtDate, fmtMoney, isOverdue } from "./_ui";

export const dynamic = "force-dynamic";

const CLOSED_STAGES = ["won", "lost"];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const isList = view === "list";

  const opportunities = await prisma.opportunity.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      stage: true,
      value: true,
      createdAt: true,
      nextFollowUp: true,
      company: { select: { id: true, name: true } },
    },
  });

  // Scoped to the deals actually on screen. Unscoped, this loaded every stage_changed
  // row ever written - a table that only grows, for a number shown on a handful of cards.
  const stageChanges = opportunities.length
    ? await prisma.activityLog.findMany({
        where: {
          action: "stage_changed",
          linkedType: "opportunity",
          linkedId: { in: opportunities.map((o) => o.id) },
        },
        orderBy: { at: "desc" },
        select: { linkedId: true, at: true },
      })
    : [];

  // Days-in-stage runs from the last logged stage change, or creation if never moved.
  const lastStageChange = new Map<string, Date>();
  for (const log of stageChanges) {
    if (!lastStageChange.has(log.linkedId)) lastStageChange.set(log.linkedId, log.at);
  }

  // Everything the client board needs, already formatted - no dates cross the boundary.
  const cards: KanbanCard[] = opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    stage: o.stage,
    value: o.value,
    companyName: o.company?.name ?? null,
    daysInStage: daysSince(lastStageChange.get(o.id) ?? o.createdAt),
    followUpLabel: o.nextFollowUp ? fmtDate(o.nextFollowUp) : null,
    followUpOverdue: isOverdue(o.nextFollowUp),
  }));

  const openCards = cards.filter((c) => !CLOSED_STAGES.includes(c.stage));
  const openTotal = openCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
  const won = cards.filter((c) => c.stage === "won");
  const lost = cards.filter((c) => c.stage === "lost");

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${openCards.length} open · ${fmtMoney(openTotal)} in play`}
      >
        <div className="flex items-center gap-1.5">
          <Link
            href="/pipeline"
            className={`chip transition-colors active:scale-[0.98] ${isList ? "" : "chip-active"}`}
          >
            Kanban
          </Link>
          <Link
            href="/pipeline?view=list"
            className={`chip transition-colors active:scale-[0.98] ${isList ? "chip-active" : ""}`}
          >
            List
          </Link>
        </div>
        <Link href="/intake" className="btn btn-primary active:scale-[0.99]">
          New intake
        </Link>
      </PageHeader>

      {isList ? (
        <PipelineList cards={cards} />
      ) : cards.length === 0 ? (
        <div className="empty-state">
          <p className="text-gray-dark">No deals yet.</p>
          <p className="mt-1">
            Deals land here from{" "}
            <Link href="/intake" className="text-primary transition-colors hover:underline">
              Intake
            </Link>{" "}
            whenever a request is a project or still needs pricing.
          </p>
        </div>
      ) : (
        <>
          <p className="page-sub mb-3">Drag a card between columns to move the deal.</p>
          <KanbanBoard cards={openCards} />
        </>
      )}

      {isList ? null : (
        <details className="card card-flush mt-8">
          <summary className="cursor-pointer px-5 py-4">
            <span className="section-label !mb-0 !inline">Closed deals</span>
            <span className="ml-3 badge badge-green">{won.length} won</span>
            <span className="ml-2 badge badge-gray">{lost.length} lost</span>
          </summary>
          <div className="border-t border-border">
            {won.length + lost.length === 0 ? (
              <div className="p-5">
                <div className="empty-state">
                  Nothing closed yet. Deals land here once you mark them Won or Lost.
                </div>
              </div>
            ) : (
              <table className="table-klyne">
                <thead>
                  <tr>
                    <th>Deal</th>
                    <th>Company</th>
                    <th>Value</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {[...won, ...lost].map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/pipeline/${c.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {c.title}
                        </Link>
                      </td>
                      <td className="text-gray-dark">
                        {c.companyName ?? <span className="empty-value">no company</span>}
                      </td>
                      <td className="tabular-nums text-gray-dark">
                        {fmtMoney(c.value) ?? <span className="empty-value">no value</span>}
                      </td>
                      <td>
                        <StageBadge stage={c.stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
