"use client";

import { useTransition } from "react";
import { assignContactCompany } from "./actions";

export function AssignCompanySelect({
  contactId,
  companies,
}: {
  contactId: string;
  companies: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Assign to business"
      defaultValue=""
      disabled={pending}
      onChange={(e) => {
        const companyId = e.target.value;
        if (!companyId) return;
        startTransition(async () => {
          await assignContactCompany(contactId, companyId);
        });
      }}
      className="input-klyne w-full max-w-xs py-1 text-xs disabled:opacity-50"
    >
      <option value="">{pending ? "Assigning…" : "Assign to a business…"}</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
