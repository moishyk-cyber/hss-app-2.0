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

  return (
    // OptimisticSelect renders an inline-flex span — give it a predictable width.
    <div className="[&>span]:flex [&>span]:w-full [&>span]:max-w-xs">
      <OptimisticSelect
        value=""
        options={options}
        className="input-klyne min-w-0 flex-1 py-1 text-xs"
        action={async (companyId) => {
          if (!companyId) return;
          await assignContactCompany(contactId, companyId);
        }}
      />
    </div>
  );
}
