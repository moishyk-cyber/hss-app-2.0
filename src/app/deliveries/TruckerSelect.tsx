"use client";

// Grey inline trucker dropdown on the deliveries list (Moishy, Aug 31): pick
// from truckers already used on other POs without opening the shipment form.
// New/unseen truckers are still typed free-text in the PO's shipment popup.

import { OptimisticSelect } from "@/lib/ui";
import { setPoTrucker } from "../orders/actions";

export function TruckerSelect({
  poId,
  value,
  truckers,
}: {
  poId: string;
  value: string | null;
  truckers: string[];
}) {
  const known = new Set(truckers);
  if (value) known.add(value);
  const options = [
    { value: "", label: "No trucker yet" },
    ...[...known].sort().map((t) => ({ value: t, label: t })),
  ];
  return (
    <OptimisticSelect
      value={value ?? ""}
      options={options}
      action={(next) => setPoTrucker(poId, next)}
      className="rounded-full border border-border bg-hover px-2.5 py-1 text-[12px] text-gray-dark"
    />
  );
}
