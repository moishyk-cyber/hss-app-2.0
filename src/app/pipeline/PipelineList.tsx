import Link from "next/link";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
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
          <Link href="/intake" className="text-primary transition-colors hover:underline">
            Intake
          </Link>{" "}
          whenever a request is a project or still needs pricing.
        </p>
      </div>
    );
  }

  return (
    <div className="card card-flush overflow-hidden">
      <ul className="divide-y divide-border">
        {rows.map((card) => (
          <li
            key={card.id}
            className="relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover"
          >
            {/* Square avatar: the deal belongs to a business (@/lib/Avatar rule). */}
            <Avatar name={card.companyName ?? card.title} kind="business" size="sm" />

            {/*
              Stretched link: the whole row opens the deal, while the stage picker
              sits above it (relative z-10) so clicking the pill still changes stage.
            */}
            <Link
              href={`/pipeline/${card.id}`}
              className="min-w-0 flex-[3] truncate text-[13.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
            >
              {card.title}
            </Link>

            <span className="hidden min-w-0 flex-[2] truncate text-[13px] text-gray-dark lg:block">
              {card.companyName ?? <span className="empty-value">no company</span>}
            </span>

            <span
              className="hidden w-28 shrink-0 truncate text-right text-[13px] tabular-nums text-gray-dark sm:block"
              title="Deal value"
            >
              {fmtMoney(card.value) ?? <span className="empty-value">no value</span>}
            </span>

            <span className="relative z-10 shrink-0">
              <StageSelect opportunityId={card.id} stage={card.stage} />
            </span>

            <span className="hidden w-24 shrink-0 text-right text-[13px] tabular-nums text-gray md:block">
              {card.daysInStage}d in stage
            </span>

            <span className="hidden w-36 shrink-0 text-right md:block">
              {card.followUpLabel ? (
                <span
                  className={`badge ${card.followUpOverdue ? "badge-orange" : "badge-gray"}`}
                  title={card.followUpOverdue ? "Follow-up overdue" : "Next follow-up"}
                >
                  {card.followUpLabel}
                </span>
              ) : (
                <span className="empty-value">not scheduled</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
