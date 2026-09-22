import Link from "next/link";
import { ORDER_PHASES, ORDER_STATUSES, ORDER_STATUS_COLORS, labelFor } from "@/lib/constants";
import { Avatar } from "@/lib/Avatar";
import type { Ball } from "@/lib/ballInCourt";
import { BallInCourtBadge } from "@/lib/BallInCourtBadge";
import { DueCell, fmtMoney } from "./utils";

/**
 * One order on the board. Everything is resolved server-side - the board is
 * deliberately read-only, so unlike the pipeline's KanbanBoard there is no
 * client bundle, no drag handlers and no optimistic state here.
 *
 * Why read-only: an order's status is computed by deriveOrderStatus() from its
 * payments, POs and deliveries every time one of them changes. A dragged card
 * would be silently recomputed back on the next payment or delivery, so the
 * board reports the flow rather than driving it. Orders move columns when you
 * record a payment, send a PO or schedule a delivery.
 */
export type OrderCard = {
  id: string;
  title: string;
  /** ORDER_PHASES value - which column. Derived by orderPhase() (@/lib/flowRules). */
  phase: string;
  /** The precise ORDER_STATUSES value, still shown on the card as a badge. */
  status: string;
  companyName: string | null;
  ownerName: string | null;
  value: number | null;
  neededByDate: Date | null;
  /** "3/5 delivered · 1 pricing" - the same phrase the list rows carry. */
  itemSummary: string | null;
  ball: Ball;
};

/** Why a column is empty, in the language of what feeds it. */
const EMPTY_HINT: Record<string, string> = {
  deposit: "Orders land here when a deal is marked Won.",
  pos: "Nothing here - orders arrive once the deposit is paid.",
  delivery: "Nothing here - orders arrive once a PO ships or a delivery is scheduled.",
  customer_service: "Nothing here - orders arrive once everything has been delivered.",
};

function money(amount: number | null): string | null {
  if (amount == null) return null;
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function OrdersKanbanBoard({ cards }: { cards: OrderCard[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ORDER_PHASES.map((phase) => {
        const columnCards = cards.filter((c) => c.phase === phase.value);
        const total = columnCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
        const stuckCount = columnCards.filter((c) => c.status === "stuck").length;

        // Four columns, so they share the width (flex-1) rather than taking the
        // pipeline's fixed w-72 and running off the right edge. The min-width
        // keeps them readable and hands the row back to overflow-x-auto once
        // the screen is too narrow to share.
        return (
          <div key={phase.value} className="card flex min-w-[15rem] flex-1 flex-col">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="section-label !mb-0">{phase.label}</h2>
              <div className="flex items-center gap-2">
                {stuckCount > 0 ? (
                  <span className="badge badge-red" title={`${stuckCount} stuck`}>
                    {stuckCount} stuck
                  </span>
                ) : null}
                {total > 0 ? (
                  <span className="text-xs tabular-nums text-gray">{money(total)}</span>
                ) : null}
                <span className="badge badge-gray">{columnCards.length}</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {columnCards.map((card) => {
                return (
                  <article
                    key={card.id}
                    className="card-sunken card-interactive relative"
                  >
                    {/*
                      Stretched link (same pattern as the pipeline cards and the
                      order list rows): the whole card opens the order, not just
                      the title text.
                    */}
                    <Link
                      href={`/orders/${card.id}`}
                      className="block text-[13px] font-medium leading-snug text-ink hover:underline after:absolute after:inset-0 after:content-['']"
                    >
                      {card.title}
                    </Link>

                    {/* Square avatar for the business, matching the directory rows. */}
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-gray">
                      {card.companyName ? (
                        <>
                          <Avatar name={card.companyName} kind="business" size="sm" />
                          <span className="truncate">{card.companyName}</span>
                        </>
                      ) : (
                        <span className="empty-value">no company</span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium tabular-nums text-ink">
                        {fmtMoney(card.value)}
                      </span>
                      <span className="text-gray">
                        <DueCell neededByDate={card.neededByDate} status={card.status} />
                      </span>
                    </div>

                    {/*
                      The precise status still shows, so the four columns never
                      hide which of the nine statuses an order actually sits on.
                      A stuck order stays in its real phase and reads red here.
                    */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${ORDER_STATUS_COLORS[card.status] ?? "badge-gray"}`}>
                        {labelFor(ORDER_STATUSES, card.status)}
                      </span>
                      <BallInCourtBadge ball={card.ball} />
                    </div>

                    {card.itemSummary ? (
                      <p className="mt-2 text-[11.5px] text-gray-dark">{card.itemSummary}</p>
                    ) : null}

                    {card.ownerName ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-gray">
                        <Avatar name={card.ownerName} kind="person" size="sm" />
                        <span className="truncate">{card.ownerName}</span>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {columnCards.length === 0 ? (
                <p className="px-1 py-10 text-center text-xs leading-relaxed text-gray">
                  {EMPTY_HINT[phase.value]}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
