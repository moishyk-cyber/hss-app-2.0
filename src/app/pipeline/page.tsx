import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { StageSelect } from "./StageSelect";
import { PageHeader, StageBadge, daysSince, fmtDate, fmtMoney, isOverdue } from "./_ui";

export const dynamic = "force-dynamic";

const CLOSED_STAGES = ["won", "lost"];

type PipelineOpportunity = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  createdAt: Date;
  nextFollowUp: Date | null;
  company: { id: string; name: string } | null;
};

export default async function PipelinePage() {
  const [opportunities, stageChanges] = await Promise.all([
    prisma.opportunity.findMany({
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
    }),
    prisma.activityLog.findMany({
      where: { linkedType: "opportunity", action: "stage_changed" },
      orderBy: { at: "desc" },
      select: { linkedId: true, at: true },
    }),
  ]);

  // Days-in-stage runs from the last logged stage change, or creation if never moved.
  const lastStageChange = new Map<string, Date>();
  for (const log of stageChanges) {
    if (!lastStageChange.has(log.linkedId)) lastStageChange.set(log.linkedId, log.at);
  }
  const daysInStage = (o: PipelineOpportunity) =>
    daysSince(lastStageChange.get(o.id) ?? o.createdAt);

  const openStages = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s.value));
  const byStage = new Map<string, PipelineOpportunity[]>();
  for (const s of OPPORTUNITY_STAGES) byStage.set(s.value, []);
  for (const o of opportunities) {
    const bucket = byStage.get(o.stage);
    if (bucket) bucket.push(o);
    else byStage.set(o.stage, [o]);
  }

  const openTotal = opportunities
    .filter((o) => !CLOSED_STAGES.includes(o.stage))
    .reduce((sum, o) => sum + (o.value ?? 0), 0);

  const won = byStage.get("won") ?? [];
  const lost = byStage.get("lost") ?? [];
  const openCount = opportunities.length - won.length - lost.length;

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${openCount} open · ${fmtMoney(openTotal)} in play`}
      >
        <Link href="/intake" className="btn btn-primary active:scale-[0.99]">
          New intake
        </Link>
      </PageHeader>

      {opportunities.length === 0 ? (
        <div className="empty-state">
          <p className="text-gray-dark">No deals yet.</p>
          <p className="mt-1">
            Deals land here from{" "}
            <Link href="/intake" className="text-accent transition-colors hover:underline">
              Intake
            </Link>{" "}
            whenever a request is a project or still needs pricing.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {openStages.map((stage, stageIndex) => {
            const cards = byStage.get(stage.value) ?? [];
            const total = cards.reduce((sum, o) => sum + (o.value ?? 0), 0);
            return (
              <div key={stage.value} className="card flex w-72 shrink-0 flex-col">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
                  <h2 className="section-label">{stage.label}</h2>
                  <div className="flex items-center gap-2">
                    {total > 0 ? <span className="text-xs text-gray">{fmtMoney(total)}</span> : null}
                    <span className="badge badge-gray">{cards.length}</span>
                  </div>
                </div>

                <div className="flex-1 space-y-2 p-3">
                  {cards.map((o) => {
                    const overdue = isOverdue(o.nextFollowUp);
                    return (
                      <article
                        key={o.id}
                        className="rounded-[10px] border border-border bg-surface p-3 transition-shadow hover:shadow-[0_2px_8px_rgba(28,33,32,0.08)]"
                      >
                        <Link
                          href={`/pipeline/${o.id}`}
                          className="block text-[13px] font-medium text-ink transition-colors hover:text-accent"
                        >
                          {o.title}
                        </Link>
                        <div className="mt-1 truncate text-xs text-gray">
                          {o.company ? o.company.name : "No company"}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">{fmtMoney(o.value)}</span>
                          <span className="text-gray">{daysInStage(o)}d in stage</span>
                        </div>

                        {o.nextFollowUp ? (
                          <div className="mt-2">
                            <span className={`badge ${overdue ? "badge-orange" : "badge-gray"}`}>
                              {overdue ? "Follow up overdue" : "Follow up"} ·{" "}
                              {fmtDate(o.nextFollowUp)}
                            </span>
                          </div>
                        ) : null}

                        <div className="mt-2.5">
                          <StageSelect opportunityId={o.id} stage={o.stage} />
                        </div>
                      </article>
                    );
                  })}

                  {cards.length === 0 ? (
                    <p className="px-1 py-8 text-center text-xs leading-relaxed text-gray">
                      {stageIndex === 0 ? (
                        <>
                          Deals land here from{" "}
                          <Link
                            href="/intake"
                            className="text-accent transition-colors hover:underline"
                          >
                            Intake
                          </Link>
                          .
                        </>
                      ) : (
                        <>Nothing here — deals arrive from {openStages[stageIndex - 1].label}.</>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <details className="card mt-2">
        <summary className="cursor-pointer px-4 py-3">
          <span className="section-label">Closed deals</span>
          <span className="ml-3 badge badge-green">{won.length} won</span>
          <span className="ml-2 badge badge-gray">{lost.length} lost</span>
        </summary>
        <div className="border-t border-border">
          {won.length + lost.length === 0 ? (
            <div className="p-4">
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
                {[...won, ...lost].map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/pipeline/${o.id}`}
                        className="font-medium text-ink transition-colors hover:text-accent"
                      >
                        {o.title}
                      </Link>
                    </td>
                    <td className="text-gray-dark">{o.company?.name ?? "—"}</td>
                    <td className="text-gray-dark">{fmtMoney(o.value)}</td>
                    <td>
                      <StageBadge stage={o.stage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
