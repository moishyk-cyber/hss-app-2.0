import Link from "@/lib/IntentLink";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { SortHeader, TableRows } from "@/lib/CollectionViews";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { StageSelect } from "./StageSelect";
import type { KanbanCard } from "./KanbanBoard";
import { fmtMoney } from "./_ui";

const STAGE_ORDER = new Map<string, number>(
  OPPORTUNITY_STAGES.map((s, i) => [s.value, i]),
);

/**
 * Flat view of every deal: stage order first, then the most stale at the top.
 * Once the Sort by control picks a column the page hands the rows over already
 * ordered by the database, so this default only applies while no sort is set.
 */
export function PipelineList({
  cards,
  sorted = false,
  filtered = false,
}: {
  cards: KanbanCard[];
  /** True when the page ordered the rows itself from a chosen sort field. */
  sorted?: boolean;
  /** True when a Filter by value is narrowing the list. */
  filtered?: boolean;
}) {
  const rows = sorted
    ? cards
    : [...cards].sort((a, b) => {
        const byStage =
          (STAGE_ORDER.get(a.stage) ?? 99) - (STAGE_ORDER.get(b.stage) ?? 99);
        if (byStage !== 0) return byStage;
        return b.daysInStage - a.daysInStage;
      });

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        {filtered ? (
          <p className="text-gray-dark">No deals match this filter.</p>
        ) : (
          <>
            <p className="text-gray-dark">No deals yet.</p>
            <p className="mt-1">
              Deals land here from{" "}
              <Link
                href="/intake"
                className="text-primary transition-colors hover:underline"
              >
                Intake
              </Link>{" "}
              whenever a request is a project or still needs pricing.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="table-klyne min-w-[850px]">
        <thead>
          <tr>
            <SortHeader field="title">Deal</SortHeader>
            <SortHeader field="company">Company</SortHeader>
            <SortHeader field="value">Value</SortHeader>
            <SortHeader field="stage">Stage</SortHeader>
            <SortHeader>Next action</SortHeader>
            <SortHeader>Waiting</SortHeader>
          </tr>
        </thead>
        <TableRows columns={6}>
          {rows.map((card) => (
            <tr key={card.id}>
              <td>
                <Link
                  href={`/pipeline/${card.id}`}
                  className="font-medium hover:underline"
                >
                  {card.title}
                </Link>
              </td>
              <td>{card.companyName ?? "—"}</td>
              <td className="tabular-nums">{fmtMoney(card.value)}</td>
              <td>
                <StageSelect opportunityId={card.id} stage={card.stage} />
              </td>
              <td>
                <BallInCourtBadge ball={card.ball} />
              </td>
              <td>{card.daysInStage}d</td>
            </tr>
          ))}
        </TableRows>
      </table>
    </div>
  );
}
