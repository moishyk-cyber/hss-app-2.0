import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { StageSelect } from "./StageSelect";
import { PageHeader, StageBadge, daysSince, fmtMoney } from "./_ui";

export const dynamic = "force-dynamic";

const CLOSED_STAGES = ["won", "lost"];

type PipelineOpportunity = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  createdAt: Date;
  company: { id: string; name: string } | null;
  salesperson: { id: string; name: string } | null;
};

export default async function PipelinePage() {
  const [opportunities, stageChanges] = await Promise.all([
    prisma.opportunity.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true } },
        salesperson: { select: { id: true, name: true } },
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

  return (
    <div>
      <PageHeader
        title="Sales Pipeline"
        subtitle={`${opportunities.length - won.length - lost.length} open · ${fmtMoney(
          openTotal
        )} in play`}
      >
        <Link href="/intake" className="btn btn-primary">
          New intake
        </Link>
      </PageHeader>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {openStages.map((stage) => {
          const cards = byStage.get(stage.value) ?? [];
          const total = cards.reduce((sum, o) => sum + (o.value ?? 0), 0);
          return (
            <div key={stage.value} className="card flex w-72 shrink-0 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
                <h2 className="section-label">{stage.label}</h2>
                <span className="badge badge-gray">{cards.length}</span>
              </div>
              <div className="px-3 pb-1 pt-2 text-xs text-gray">{fmtMoney(total)}</div>

              <div className="flex-1 space-y-2 p-3 pt-2">
                {cards.map((o) => (
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
                    <div className="mt-1 truncate text-xs text-gray">
                      {o.salesperson?.name ?? "Unassigned"}
                    </div>
                    <div className="mt-2.5">
                      <StageSelect opportunityId={o.id} stage={o.stage} />
                    </div>
                  </article>
                ))}
                {cards.length === 0 ? (
                  <p className="px-1 py-8 text-center text-xs text-gray">Nothing here</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <details className="card mt-2">
        <summary className="cursor-pointer px-4 py-3">
          <span className="section-label">Closed deals</span>
          <span className="ml-3 badge badge-green">{won.length} won</span>
          <span className="ml-2 badge badge-gray">{lost.length} lost</span>
        </summary>
        <div className="border-t border-border">
          {won.length + lost.length === 0 ? (
            <div className="p-4">
              <div className="empty-state">No closed deals yet.</div>
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
