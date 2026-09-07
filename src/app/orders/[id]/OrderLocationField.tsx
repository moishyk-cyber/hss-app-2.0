"use client";

// The order's delivery site, picked from the customer's saved locations (Sep 3
// plan A1.6) - or, since Sep 7, added right here if it isn't on file yet, same
// type-to-search-or-create pattern as intake's business/contact pickers.
// Picking one copies its address onto the order, which is what the delivery
// leg reads - so the address is chosen, never retyped (though it can still be
// corrected directly via the Delivery Address field next to it).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchCombobox, type ComboboxOption } from "@/lib/Combobox";
import { InlineError, PencilIcon, Spinner } from "@/lib/ui";
import { createLocationForOrder, setOrderLocation } from "../actions";

export function OrderLocationField({
  orderId,
  companyId,
  locationId,
  locationName,
  locations,
}: {
  orderId: string;
  /** No business picked yet - locations belong to one, so editing is disabled. */
  companyId: string | null;
  locationId: string | null;
  locationName: string | null;
  locations: { id: string; name: string; address: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(locationName ?? "");
  const [selectedId, setSelectedId] = useState(locationId ?? "");
  /** Set to the typed name while filling in the new location's address. */
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!companyId) {
    return <span className="empty-value">pick a business first</span>;
  }
  // A local const (not the raw parameter) so it stays narrowed to `string`
  // inside the closures below - TS won't carry a parameter's narrowing into a
  // nested function.
  const safeCompanyId = companyId;

  const options: ComboboxOption[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    hint: l.address,
  }));

  function pick(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await setOrderLocation(orderId, id);
      if (result.ok) {
        setEditing(false);
        // Picking a location also copies its address onto the order - refresh
        // so the Delivery Address field next to this one shows it.
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function saveNewLocation() {
    const name = (creatingName ?? "").trim();
    const address = newAddress.trim();
    if (!name || !address) {
      setError("A location needs a name and an address.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await createLocationForOrder(orderId, safeCompanyId, { name, address });
      if (result.ok) {
        setEditing(false);
        setCreatingName(null);
        setNewAddress("");
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
          {locationName ?? <span className="empty-value">not set</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setQuery(locationName ?? "");
            setSelectedId(locationId ?? "");
            setError(null);
            setEditing(true);
          }}
          aria-label="Edit location"
          className="shrink-0 text-gray transition-colors hover:text-ink"
        >
          <PencilIcon />
        </button>
      </span>
    );
  }

  if (creatingName != null) {
    return (
      <div className="w-full max-w-xs space-y-2 rounded-[10px] border border-border bg-panel p-2.5">
        <div className="text-xs font-medium text-ink">New location: {creatingName}</div>
        <input
          autoFocus
          placeholder="Delivery address"
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          className="input-klyne w-full"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={saveNewLocation}
            className="btn btn-sm btn-primary active:scale-[0.99]"
          >
            {pending ? <Spinner /> : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingName(null);
              setNewAddress("");
              setError(null);
            }}
            className="text-xs text-gray-dark transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red">{error}</p>}
      </div>
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
        label="Location"
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
          pick(o.id);
        }}
        onCreate={(name) => setCreatingName(name)}
        emptyText="No saved locations - type a name to add one."
      />
      <div className="mt-1 flex items-center gap-3">
        {pending && <Spinner className="text-gray" />}
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
