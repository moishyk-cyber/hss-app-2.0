"use client";

import { useState } from "react";
import { BusinessCombobox } from "../companies/BusinessCombobox";
import { RequiredMark } from "./_ui";

/**
 * Business picker for the contact form. Every contact belongs to a business, but
 * the business might not be on file yet — so "create what you typed" is inline.
 * Submits either `companyId` (existing) or `newCompanyName` (create-then-attach).
 */
export function BusinessField({
  companies,
  defaultCompanyId,
  defaultCompanyName,
}: {
  companies: { id: string; name: string }[];
  defaultCompanyId?: string | null;
  defaultCompanyName?: string | null;
}) {
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [query, setQuery] = useState(defaultCompanyName ?? "");
  const [creatingName, setCreatingName] = useState("");

  const creating = creatingName !== "";

  if (creating) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label mb-0">
            Business
            <RequiredMark />
          </span>
          <button
            type="button"
            onClick={() => {
              setCreatingName("");
              setQuery("");
            }}
            className="text-xs text-gray-dark transition-colors hover:text-accent"
          >
            ← Search existing instead
          </button>
        </div>
        <input
          name="newCompanyName"
          required
          autoFocus
          value={creatingName}
          onChange={(e) => setCreatingName(e.target.value)}
          className="input-klyne w-full"
        />
        <p className="text-xs text-gray">
          <span className="badge badge-green">New</span> This business will be created and the
          contact attached to it.
        </p>
        <input type="hidden" name="companyId" value="" />
      </div>
    );
  }

  return (
    <div>
      <BusinessCombobox
        required
        options={companies.map((c) => ({ id: c.id, name: c.name }))}
        query={query}
        setQuery={(next) => {
          setQuery(next);
          if (companyId) setCompanyId("");
        }}
        selectedId={companyId}
        onPick={(o) => {
          setCompanyId(o.id);
          setQuery(o.name);
        }}
        onCreate={(name) => {
          setCreatingName(name);
          setCompanyId("");
        }}
      />
      <input type="hidden" name="companyId" value={companyId} />
    </div>
  );
}
