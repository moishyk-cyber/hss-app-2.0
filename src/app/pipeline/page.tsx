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
        <Link
          href="/intake"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          New intake
        </Link>
      </PageHeader>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {openStages.map((stage) => {
          const cards = byStage.get(stage.value) ?? [];
          const total = cards.reduce((sum, o) => sum + (o.value ?? 0), 0);
          return (
            <div key={stage.value} className="w-72 shrink-0">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold text-gray-800">{stage.label}</h2>
                <span className="text-xs text-gray-500">
                  {cards.length} · {fmtMoney(total)}
                </span>
              </div>
              <div className="space-y-2 rounded-lg bg-gray-100/70 p-2">
                {cards.map((o) => (
                  <article
                    key={o.id}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <Link
                      href={`/pipeline/${o.id}`}
                      className="block text-sm font-medium text-gray-900 hover:underline"
                    >
                      {o.title}
                    </Link>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {o.company ? o.company.name : "No company"}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-800">{fmtMoney(o.value)}</span>
                      <span className="text-gray-500">{daysInStage(o)}d in stage</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {o.salesperson?.name ?? "Unassigned"}
                    </div>
                    <div className="mt-2">
                      <StageSelect opportunityId={o.id} stage={o.stage} />
                    </div>
                  </article>
                ))}
                {cards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-gray-400">Nothing here</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-4 rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-gray-800">
          Closed deals — {won.length} won · {lost.length} lost
        </summary>
        <div className="border-t border-gray-200 p-4">
          {won.length + lost.length === 0 ? (
            <p className="text-sm text-gray-500">No closed deals yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-1 font-medium">Deal</th>
                  <th className="py-1 font-medium">Company</th>
                  <th className="py-1 font-medium">Value</th>
                  <th className="py-1 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...won, ...lost].map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5">
                      <Link href={`/pipeline/${o.id}`} className="text-gray-900 hover:underline">
                        {o.title}
                      </Link>
                    </td>
                    <td className="py-1.5 text-gray-600">{o.company?.name ?? "—"}</td>
                    <td className="py-1.5 text-gray-600">{fmtMoney(o.value)}</td>
                    <td className="py-1.5">
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
