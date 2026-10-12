"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/lib/PageLayout";
import { ListControls } from "@/lib/ListControls";
import { ToolbarIcon } from "@/lib/ToolbarIcon";
import { MoreRecords } from "@/lib/CollectionWindow";
import type { ListField } from "@/lib/listQuery";
import type { DeliveryGrouping } from "./boardConfig";
import DeliveryBoard, { type DeliveryBoardRow } from "./DeliveryBoard";

export default function DeliveryCollection({ rows, fields, canEdit, hasMore, limit, children }: {
  rows: DeliveryBoardRow[];
  fields: ListField[];
  canEdit: boolean;
  hasMore: boolean;
  limit: number;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const isKanban = params.get("view") === "kanban";
  const requestedGroup = params.get("group");
  const group: DeliveryGrouping = !isKanban && requestedGroup === "mode" ? "mode" : "stage";
  function changeView(view: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return <div className="space-y-6">
    <PageHeader title="Deliveries" subtitle="Track manufacturer shipments and customer deliveries."
      toolbar={<Suspense><ListControls fields={fields} count={rows.length} hasMore={hasMore}
        groupBy={{ value: !isKanban && requestedGroup === "none" ? "none" : group, options: [
          { value: "stage", label: "Stage" },
          ...(!isKanban ? [{ value: "mode", label: "Delivery Mode" }, { value: "none", label: "None" }] : []),
        ] }}>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => changeView("list")} className={`chip ${!isKanban ? "chip-active" : ""}`} aria-label="Table view" aria-pressed={!isKanban} data-view-tooltip="Table view — Deliveries in rows and columns"><ToolbarIcon name="table" /><span className="sr-only">Table</span></button>
          <button type="button" onClick={() => changeView("kanban")} className={`chip ${isKanban ? "chip-active" : ""}`} aria-label="Kanban view" aria-pressed={isKanban} data-view-tooltip="Kanban view — Deliveries grouped into columns"><ToolbarIcon name="kanban" /><span className="sr-only">Kanban</span></button>
        </div>
      </ListControls></Suspense>} />
    {isKanban ? <DeliveryBoard key={group} deliveries={rows} canEdit={canEdit} group={group} /> : children}
    <MoreRecords href="/deliveries" limit={limit} hasMore={hasMore} />
  </div>;
}
