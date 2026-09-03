"use client";

// Locations card on the business page: the physical sites this customer takes
// delivery at. One of them is the default, which is what the intake form, the
// Close panel and the deal edit form prefill with - so the delivery address is
// asked for once, on the business, instead of being retyped every call.
//
// Deleting is deliberately awkward when a deal or an order still points at the
// location: the action refuses with a count and the dialog then asks where those
// records should move to.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import type { ActionResult } from "@/lib/actionResult";
import { Spinner } from "@/lib/ui";
import { createLocation, deleteLocation, setDefaultLocation, updateLocation } from "./actions";

export type CompanyLocation = {
  id: string;
  name: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryNotes: string | null;
  isDefault: boolean;
};

type Draft = {
  name: string;
  address: string;
  contactName: string;
  contactPhone: string;
  deliveryNotes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  address: "",
  contactName: "",
  contactPhone: "",
  deliveryNotes: "",
};

function draftFrom(location: CompanyLocation): Draft {
  return {
    name: location.name,
    address: location.address,
    contactName: location.contactName ?? "",
    contactPhone: location.contactPhone ?? "",
    deliveryNotes: location.deliveryNotes ?? "",
  };
}

const inputClass = "input-klyne w-full";

function LocationFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="field-label">Location name</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Main kitchen"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="field-label">Address</span>
        <input
          value={draft.address}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="Street, city, state"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="field-label">Site contact</span>
        <input
          value={draft.contactName}
          onChange={(e) => onChange({ contactName: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="field-label">Site phone</span>
        <input
          type="tel"
          inputMode="tel"
          value={draft.contactPhone}
          onChange={(e) => onChange({ contactPhone: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">Delivery notes</span>
        <input
          value={draft.deliveryNotes}
          onChange={(e) => onChange({ deliveryNotes: e.target.value })}
          placeholder="Loading dock, hours, who to call on arrival"
          className={inputClass}
        />
      </label>
    </div>
  );
}

export function LocationsCard({
  companyId,
  locations,
}: {
  companyId: string;
  locations: CompanyLocation[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [deleting, setDeleting] = useState<CompanyLocation | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  function run(fn: () => Promise<ActionResult>, onDone?: () => void) {
    startTransition(async () => {
      setError(null);
      try {
        const result = await fn();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onDone?.();
      } catch {
        setError("Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    });
  }

  function submitAdd() {
    run(() => createLocation(companyId, addDraft), () => {
      setAddDraft(EMPTY_DRAFT);
      setAdding(false);
    });
  }

  function submitEdit(locationId: string) {
    run(() => updateLocation(locationId, editDraft), () => setEditingId(null));
  }

  function startEdit(location: CompanyLocation) {
    setError(null);
    setEditingId(location.id);
    setEditDraft(draftFrom(location));
  }

  function confirmDelete() {
    const target = deleting;
    if (!target) return;
    run(() => deleteLocation(target.id, reassignTo || null), () => {
      setDeleting(null);
      setReassignTo("");
    });
  }

  const reassignOptions = deleting
    ? locations.filter((l) => l.id !== deleting.id)
    : [];

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="section-label">Locations ({locations.length})</h2>
        {adding ? null : (
          <button
            type="button"
            className="btn btn-sm active:scale-[0.99]"
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
          >
            Add location
          </button>
        )}
      </div>

      {error ? <div className="banner-alert mb-3">{error}</div> : null}

      {locations.length === 0 && !adding ? (
        <div className="empty-state">
          No sites on file yet. Add one and every intake, deal and order for this business can
          pick it instead of retyping the address.
        </div>
      ) : null}

      {locations.length > 0 ? (
        <ul className="-mx-5 divide-y divide-border border-t border-border">
          {locations.map((location) => (
            <li key={location.id} className="px-5 py-3">
              {editingId === location.id ? (
                <div className="space-y-3">
                  <LocationFields
                    draft={editDraft}
                    onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => submitEdit(location.id)}
                      className="btn btn-sm btn-primary active:scale-[0.99]"
                    >
                      {isPending ? <Spinner /> : null}
                      Save location
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="btn btn-sm active:scale-[0.99]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{location.name}</span>
                      {location.isDefault ? (
                        <span className="badge badge-blue">Default</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[13px] text-gray-dark">{location.address}</p>
                    {location.contactName || location.contactPhone ? (
                      <p className="mt-0.5 text-[13px] text-gray">
                        {[location.contactName, location.contactPhone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {location.deliveryNotes ? (
                      <p className="mt-0.5 text-xs text-gray">{location.deliveryNotes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {location.isDefault ? null : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => setDefaultLocation(location.id))}
                        className="btn btn-sm active:scale-[0.99]"
                      >
                        Make default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(location)}
                      className="btn btn-sm active:scale-[0.99]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setReassignTo("");
                        setDeleting(location);
                      }}
                      className="btn btn-sm btn-danger active:scale-[0.99]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="mt-4 space-y-3 rounded-[10px] border border-border bg-panel p-3">
          <p className="section-label !mb-0">New location</p>
          <LocationFields
            draft={addDraft}
            onChange={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submitAdd}
              className="btn btn-sm btn-primary active:scale-[0.99]"
            >
              {isPending ? <Spinner /> : null}
              Add location
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddDraft(EMPTY_DRAFT);
              }}
              className="btn btn-sm active:scale-[0.99]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting != null}
        title={`Delete ${deleting?.name ?? "this location"}?`}
        confirmLabel="Delete location"
        danger
        pending={isPending}
        onConfirm={confirmDelete}
        onClose={() => {
          setDeleting(null);
          setReassignTo("");
        }}
      >
        <div className="space-y-3 text-[13px]">
          <p>
            The site comes off this business. Deals and orders keep the delivery address they
            were saved with - only the link to this location changes.
          </p>
          {reassignOptions.length > 0 ? (
            <label className="block">
              <span className="field-label">Move any deals and orders to</span>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className={inputClass}
              >
                <option value="">Leave them unlinked (only works when nothing points here)</option>
                {reassignOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? <p className="text-red">{error}</p> : null}
        </div>
      </ConfirmDialog>
    </section>
  );
}
