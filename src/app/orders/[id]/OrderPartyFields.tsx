"use client";

// Pencil-edit company/contact on the order details grid, using the same
// type-to-search-or-create combobox as intake (Sep 7: "same style as
// search... if it doesn't come up, be able to add it").

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchCombobox, type ComboboxOption } from "@/lib/Combobox";
import { InlineError, PencilIcon, Spinner } from "@/lib/ui";
import type { ActionResult } from "@/lib/actionResult";
import { setOrderCompany, setOrderContact } from "../actions";

/** Shared pencil-toggle-to-combobox shell for a single related record. */
function EditableParty({
  label,
  ariaLabel,
  currentLabel,
  currentId,
  options,
  emptyText,
  allowClear,
  save,
}: {
  label: string;
  ariaLabel: string;
  currentLabel: string | null;
  currentId: string;
  options: ComboboxOption[];
  emptyText?: string;
  /** Show a "Clear" link while editing (contact can be unset; a business cannot). */
  allowClear?: boolean;
  save: (id: string, newName: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(currentLabel ?? "");
  const [selectedId, setSelectedId] = useState(currentId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function apply(id: string, newName: string) {
    startTransition(async () => {
      setError(null);
      const result = await save(id, newName);
      if (result.ok) {
        setEditing(false);
        // A company change clears contact/location/address server-side - pull
        // a fresh render so the other pencil fields on this card show that.
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (!editing) {
    return (
      <span className="relative inline-flex min-w-0 items-center gap-1.5">
        <span className="truncate text-ink">
          {currentLabel ?? <span className="empty-value">not set</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setQuery(currentLabel ?? "");
            setSelectedId(currentId);
            setError(null);
            setEditing(true);
          }}
          aria-label={ariaLabel}
          className="shrink-0 text-gray transition-colors hover:text-ink"
        >
          <PencilIcon />
        </button>
      </span>
    );
  }

  return (
    <div
      className="relative w-full max-w-xs"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !pending) setEditing(false);
      }}
    >
      <SearchCombobox
        label={label}
        options={options}
        query={query}
        setQuery={(next) => {
          setQuery(next);
          if (selectedId) setSelectedId("");
        }}
        selectedId={selectedId}
        onPick={(o) => {
          setSelectedId(o.id);
          setQuery(o.name);
          apply(o.id, "");
        }}
        onCreate={(name) => apply("", name)}
        emptyText={emptyText}
      />
      <div className="mt-1 flex items-center gap-3">
        {pending && <Spinner className="text-gray" />}
        {allowClear ? (
          <button
            type="button"
            onClick={() => apply("", "")}
            className="text-xs text-gray-dark transition-colors hover:text-ink"
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-gray-dark transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {error && <InlineError message={error} />}
    </div>
  );
}

export function EditableCompanyField({
  orderId,
  companyId,
  companyName,
  companies,
}: {
  orderId: string;
  companyId: string | null;
  companyName: string | null;
  companies: { id: string; name: string }[];
}) {
  return (
    <EditableParty
      label="Business"
      ariaLabel="Edit business"
      currentLabel={companyName}
      currentId={companyId ?? ""}
      options={companies}
      emptyText="Nothing on file yet - type a name to create one."
      save={(id, newName) => setOrderCompany(orderId, id, newName)}
    />
  );
}

export function EditableContactField({
  orderId,
  companyId,
  contactId,
  contactName,
  contacts,
}: {
  orderId: string;
  /** No business picked yet - contacts belong to one, so editing is disabled. */
  companyId: string | null;
  contactId: string | null;
  contactName: string | null;
  contacts: { id: string; firstName: string; lastName: string | null; companyId: string | null }[];
}) {
  if (!companyId) {
    return <span className="empty-value">pick a business first</span>;
  }
  const options: ComboboxOption[] = contacts
    .filter((c) => c.companyId === companyId)
    .map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") }));

  return (
    <EditableParty
      label="Contact"
      ariaLabel="Edit contact"
      currentLabel={contactName}
      currentId={contactId ?? ""}
      options={options}
      emptyText="No contacts on this business yet - type a name to add one."
      allowClear
      save={(id, newName) => setOrderContact(orderId, id, newName)}
    />
  );
}
