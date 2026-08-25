"use client";

import { OptimisticSelect } from "@/lib/ui";
import { assignContactCompany } from "./actions";

export function AssignCompanySelect({
  contactId,
  companies,
}: {
  contactId: string;
  companies: { id: string; name: string }[];
}) {
  const options = [
    { value: "", label: "Assign to a business…" },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  // Not a status pill — this is an assignment picker, so it stays a plain select.
  return (
    <OptimisticSelect
      value=""
      options={options}
      className="input-klyne max-w-xs py-1 text-xs"
      action={async (companyId) => {
        if (!companyId) return;
        await assignContactCompany(contactId, companyId);
      }}
    />
  );
}
