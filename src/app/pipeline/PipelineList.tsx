import Link from "next/link";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { StageSelect } from "./StageSelect";
import type { KanbanCard } from "./KanbanBoard";
import { fmtMoney } from "./_ui";

const STAGE_ORDER = new Map<string, number>(
  OPPORTUNITY_STAGES.map((s, i) => [s.value, i])
);

/** Flat view of every deal: stage order first, then the most stale at the top. */
export function PipelineList({ cards }: { cards: KanbanCard[] }) {
  const rows = [...cards].sort((a, b) => {
    const byStage =
      (STAGE_ORDER.get(a.stage) ?? 99) - (STAGE_ORDER.get(b.stage) ?? 99);
    if (byStage !== 0) return byStage;
    return b.daysInStage - a.daysInStage;
  });

  if (rows.length === 0) {
    return (
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
    );
  }

  return (
    <div className="card card-flush overflow-hidden overflow-x-auto">
      <table className="table-klyne min-w-[900px]">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Company</th>
            <th>Stage</th>
            <th>Value</th>
            <th>Days in stage</th>
            <th>Next follow-up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((card) => (
            <tr key={card.id}>
              <td>
                <Link
                  href={`/pipeline/${card.id}`}
                  className="font-medium text-ink transition-colors hover:text-accent"
                >
                  {card.title}
                </Link>
              </td>
              <td className="text-gray-dark">
                {card.companyName ?? <span className="empty-value">no company</span>}
              </td>
              <td>
                <StageSelect opportunityId={card.id} stage={card.stage} />
              </td>
              <td className="tabular-nums text-gray-dark">
                {fmtMoney(card.value) ?? <span className="empty-value">no value</span>}
              </td>
              <td className="tabular-nums text-gray-dark">{card.daysInStage}d</td>
              <td>
                {card.followUpLabel ? (
                  <span className={`badge ${card.followUpOverdue ? "badge-orange" : "badge-gray"}`}>
                    {card.followUpLabel}
                  </span>
                ) : (
                  <span className="empty-value">not scheduled</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
