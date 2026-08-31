"use client";

// Intake, rebuilt for the Aug 31 feedback round: ONE top-to-bottom column of
// numbered sections that unlock as they're answered, instead of a two-column
// wall of panels. Still a single <form> — progressive disclosure only hides
// what hasn't been reached yet, so nothing is a separate route or a lost draft.

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { FormAlert, PendingButton } from "@/lib/ui";
import { readStoredUserId, storeUserId } from "@/lib/identityClient";
import { BusinessCombobox } from "../companies/BusinessCombobox";
import { submitIntake } from "./actions";

const MAX_COMPANY_RESULTS = 8;
const MAX_CONTACT_RESULTS = 8;

function subscribeToStoredSalesperson(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The server has no localStorage, so it always renders "unassigned". */
function noStoredSalesperson(): string | null {
  return null;
}

type IntakeContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  companyId: string | null;
};

type IntakeCompany = {
  id: string;
  name: string;
  deliveryAddress: string | null;
  locationName: string | null;
};

type ItemRow = { key: number; name: string; details: string; qty: string };

const inputClass = "input-klyne w-full";
const labelClass = "field-label";

function contactName(contact: IntakeContact): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

/**
 * One numbered step of the call. A locked section shows its number and title so
 * the whole shape of the form is visible from the start — it just can't be
 * answered out of order.
 */
function Section({
  index,
  title,
  hint,
  locked,
  lockedHint,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  locked?: boolean;
  lockedHint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card ${locked ? "opacity-60" : ""}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span
          aria-hidden
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
            locked ? "bg-hover text-gray" : "bg-primary text-white"
          }`}
        >
          {index}
        </span>
        <div className="min-w-0">
          <h2 className="section-label !mb-0">{title}</h2>
          {locked ? (
            lockedHint ? (
              <p className="mt-1 text-xs text-gray">{lockedHint}</p>
            ) : null
          ) : hint ? (
            <p className="mt-1 text-xs text-gray">{hint}</p>
          ) : null}
        </div>
      </header>
      {locked ? null : <div className="mt-5">{children}</div>}
    </section>
  );
}

/** Compact two-way toggle. Value is carried by a sibling hidden input. */
function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-border bg-panel p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors active:scale-[0.98] ${
            value === o.value
              ? "bg-surface text-ink shadow-[var(--shadow-card)]"
              : "text-gray-dark hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Real radio input (its value must reach the server action) rendered as a compact pill. */
function InlineRadio({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
        checked ? "border-primary bg-hover text-ink" : "border-border bg-surface hover:bg-hover"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="h-3.5 w-3.5 accent-primary"
      />
      {label}
    </label>
  );
}

/** Quiet "move on" control at the foot of a section. */
function NextButton({
  onClick,
  disabled,
  disabledReason,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`btn btn-sm active:scale-[0.99] ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        {children}
      </button>
      {disabled && disabledReason ? (
        <span className="text-xs text-gray">{disabledReason}</span>
      ) : null}
    </div>
  );
}

export function IntakeForm({
  companies,
  contacts,
  salespeople,
  initialCompanyId,
  error,
  duplicateCompany,
}: {
  companies: IntakeCompany[];
  /** Every contact, filtered to the picked business client-side. */
  contacts: IntakeContact[];
  salespeople: { id: string; name: string }[];
  initialCompanyId?: string;
  error?: string;
  /** Name of the already-existing business that blocked a "new client" submission. */
  duplicateCompany?: string;
}) {
  const initialCompany = initialCompanyId
    ? companies.find((c) => c.id === initialCompanyId)
    : undefined;

  // How far down the call we've got. Sections above this are answerable.
  const [openSection, setOpenSection] = useState(initialCompany ? 2 : 1);

  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [companyQuery, setCompanyQuery] = useState(initialCompany?.name ?? "");
  const [companyId, setCompanyId] = useState(initialCompany?.id ?? "");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [overrideDelivery, setOverrideDelivery] = useState(false);
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [contactQuery, setContactQuery] = useState("");
  const [contactId, setContactId] = useState("");
  // Tracked only so the form can say out loud that a blank name creates no contact —
  // the server stays permissive here, because mid-call speed beats a blocking error.
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [showSalespersonPicker, setShowSalespersonPicker] = useState(false);
  const [salespersonOverride, setSalespersonOverride] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<"project" | "order">("project");
  const [deliveryType, setDeliveryType] = useState<"curbside" | "inside">("curbside");
  const [installationNeeded, setInstallationNeeded] = useState("no");
  const [needsPricing, setNeedsPricing] = useState("yes");
  const [items, setItems] = useState<ItemRow[]>([
    { key: 1, name: "", details: "", qty: "1" },
  ]);
  const [nextKey, setNextKey] = useState(2);
  // Newly-added rows mount with autoFocus, which lands the caret in their name field.
  const [autoFocusKey, setAutoFocusKey] = useState(0);

  // No auth yet: the sidebar's "Working as" identity is who this intake belongs to.
  // The salesperson dropdown is gone from the form — it was one more thing to fill in
  // mid-call, and it always meant "me".
  const storedSalespersonId = useSyncExternalStore(
    subscribeToStoredSalesperson,
    readStoredUserId,
    noStoredSalesperson
  );
  const rememberedSalespersonId =
    storedSalespersonId && salespeople.some((u) => u.id === storedSalespersonId)
      ? storedSalespersonId
      : null;
  // An explicit pick wins; otherwise fall back to whoever the sidebar says we are.
  const salespersonId = salespersonOverride ?? rememberedSalespersonId ?? "";
  const salespersonName = salespeople.find((u) => u.id === salespersonId)?.name ?? null;

  function rememberSalesperson(id: string) {
    // storeUserId also mirrors into the cookie Server Actions read for attribution.
    if (id) storeUserId(id);
  }

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: c.id, name: c.name, hint: c.locationName })),
    [companies]
  );

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;

  // Contacts are loaded whole and filtered here — the picked business is client state.
  const contactOptions = useMemo(
    () =>
      companyId
        ? contacts
            .filter((c) => c.companyId === companyId)
            .map((c) => ({ id: c.id, name: contactName(c) }))
        : [],
    [contacts, companyId]
  );

  const goesToPipeline = orderType === "project" || needsPricing === "yes";

  // A deal without a client is not useful — keep everything downstream closed
  // until one is picked (or a new one is being typed).
  const clientReady =
    clientMode === "new" ? newCompanyName.trim() !== "" : companyId !== "";

  const namedItemCount = items.filter((i) => i.name.trim() !== "").length;
  const clientLabel =
    clientMode === "new"
      ? newCompanyName.trim() || "New client"
      : (selectedCompany?.name ?? "No client selected");

  function resetContact() {
    setContactMode("existing");
    setContactQuery("");
    setContactId("");
    setNewContactFirstName("");
  }

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addItem() {
    setItems((rows) => [...rows, { key: nextKey, name: "", details: "", qty: "1" }]);
    setAutoFocusKey(nextKey);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  /** Enter inside an item row never submits — it adds the next row instead. */
  function onItemKeyDown(e: React.KeyboardEvent, isLastRow: boolean) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isLastRow) addItem();
  }

  const contactSummary =
    clientMode === "new" || contactMode === "new"
      ? newContactFirstName.trim() || "no contact"
      : contactId
        ? (contactOptions.find((o) => o.id === contactId)?.name ?? "contact")
        : "no contact";

  return (
    <form
      action={submitIntake}
      onSubmit={() => rememberSalesperson(salespersonId)}
      className="mx-auto max-w-3xl pb-4"
    >
      {error === "duplicate_company" ? (
        <FormAlert>
          <strong>{duplicateCompany ?? "That business"}</strong> is already on file — nothing was
          saved. Search for it above and pick the existing record instead of creating a second one.
          If it doesn&rsquo;t show up in the search, open{" "}
          <Link href="/companies" className="underline">
            Businesses
          </Link>{" "}
          and check its type: only customers and leads appear in this picker.
        </FormAlert>
      ) : error === "save_failed" ? (
        <FormAlert>Something went wrong while saving. Please try again.</FormAlert>
      ) : null}

      {/* hidden mirrors of the branching state so the server action sees plain fields */}
      <input type="hidden" name="clientMode" value={clientMode} />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="orderType" value={orderType} />

      <div className="space-y-5">
        {/* ============ 1 — Who's calling ============ */}
        <Section index={1} title="Who’s calling" hint="Find the business, then the person.">
          {clientMode === "existing" ? (
            <div className="space-y-4">
              <BusinessCombobox
                query={companyQuery}
                setQuery={(next) => {
                  setCompanyQuery(next);
                  // Typing again means they're re-searching — drop the old pick.
                  if (companyId) {
                    setCompanyId("");
                    setOverrideDelivery(false);
                    resetContact();
                  }
                }}
                options={companyOptions}
                maxResults={MAX_COMPANY_RESULTS}
                selectedId={companyId}
                onPick={(o) => {
                  setCompanyId(o.id);
                  setCompanyQuery(o.name);
                  setOverrideDelivery(false);
                  resetContact();
                }}
                onCreate={(name) => {
                  setClientMode("new");
                  setNewCompanyName(name);
                  setCompanyId("");
                  setOverrideDelivery(false);
                  setContactMode("new");
                  setContactId("");
                  setContactQuery("");
                }}
              />
              {/* The combobox is a display control; this carries the real value. */}
              <input type="hidden" name="companyId" value={companyId} />

              {selectedCompany ? (
                <>
                  {/* --- delivery address, straight off the business --- */}
                  <div className="rounded-[10px] border border-border bg-panel p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="section-label !mb-0">Delivery address</span>
                      {overrideDelivery ? (
                        <button
                          type="button"
                          onClick={() => setOverrideDelivery(false)}
                          className="text-xs text-gray-dark transition-colors hover:text-ink"
                        >
                          Use the address on file
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOverrideDelivery(true)}
                          className="text-xs text-primary transition-colors hover:underline"
                        >
                          Deliver somewhere else
                        </button>
                      )}
                    </div>

                    {overrideDelivery ? (
                      <input
                        name="deliveryAddress"
                        autoFocus
                        placeholder="Where is this going instead?"
                        className={inputClass}
                      />
                    ) : (
                      <p className="text-[13px] text-ink">
                        {selectedCompany.locationName ? (
                          <span className="text-gray-dark">
                            {selectedCompany.locationName} ·{" "}
                          </span>
                        ) : null}
                        {selectedCompany.deliveryAddress ?? (
                          <span className="empty-value">No delivery address on file</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* --- contact: same search-or-create pattern as the business --- */}
                  <div className="rounded-[10px] border border-border bg-panel p-3">
                    {contactMode === "existing" ? (
                      <>
                        <BusinessCombobox
                          label="Contact"
                          placeholder="Search this business’s people…"
                          query={contactQuery}
                          setQuery={(next) => {
                            setContactQuery(next);
                            if (contactId) setContactId("");
                          }}
                          options={contactOptions}
                          maxResults={MAX_CONTACT_RESULTS}
                          selectedId={contactId}
                          onPick={(o) => {
                            setContactId(o.id);
                            setContactQuery(o.name);
                          }}
                          onCreate={(name) => {
                            setContactMode("new");
                            setContactId("");
                            setNewContactFirstName(name);
                          }}
                        />
                        <input type="hidden" name="contactId" value={contactId} />
                        {contactId === "" ? (
                          <p className="mt-2 text-xs text-gray">
                            No contact will be created — leave this blank if you didn&rsquo;t catch
                            a name.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="section-label !mb-0">New contact</span>
                          <button
                            type="button"
                            onClick={() => {
                              setContactMode("existing");
                              setContactQuery(newContactFirstName);
                            }}
                            className="text-xs text-gray-dark transition-colors hover:text-ink"
                          >
                            Search existing instead
                          </button>
                        </div>
                        <NewContactFields
                          firstName={newContactFirstName}
                          onFirstNameChange={setNewContactFirstName}
                        />
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="badge badge-blue">New business</span>
                <button
                  type="button"
                  onClick={() => {
                    setClientMode("existing");
                    setCompanyQuery(newCompanyName);
                    resetContact();
                  }}
                  className="text-xs text-gray-dark transition-colors hover:text-ink"
                >
                  Search existing instead
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={labelClass}>Business name</span>
                  <input
                    name="newCompanyName"
                    required
                    autoFocus
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Phone</span>
                  <input name="newCompanyPhone" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Extension</span>
                  <input name="newCompanyPhoneExt" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Cell phone</span>
                  <input name="newCompanyCellPhone" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Email</span>
                  <input type="email" name="newCompanyEmail" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Business address</span>
                  <input name="newCompanyAddress" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Delivery address</span>
                  <input name="newCompanyDeliveryAddress" className={inputClass} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelClass}>Name of location</span>
                  <input name="newCompanyLocationName" className={inputClass} />
                </label>
              </div>

              <div className="rounded-[10px] border border-border bg-panel p-3">
                <p className="section-label mb-2">Primary contact</p>
                <NewContactFields
                  firstName={newContactFirstName}
                  onFirstNameChange={setNewContactFirstName}
                />
              </div>
            </div>
          )}

          {openSection < 2 ? (
            <NextButton
              onClick={() => setOpenSection(2)}
              disabled={!clientReady}
              disabledReason="Pick or create a business first"
            >
              Next — what do they need?
            </NextButton>
          ) : null}
        </Section>

        {/* ============ 2 — What do they need ============ */}
        <Section
          index={2}
          title="What do they need"
          hint="Press Enter on the last item to add another."
          locked={openSection < 2}
          lockedHint="Answer step 1 first."
        >
          {/* Order type comes FIRST: it decides what the rest of this step asks for. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`${labelClass} !mb-0`}>Project or order?</span>
            <Segmented
              ariaLabel="Order type"
              value={orderType}
              onChange={(v) => setOrderType(v as "project" | "order")}
              options={[
                { value: "project", label: "Project" },
                { value: "order", label: "Order" },
              ]}
            />
          </div>

          {orderType === "project" ? (
            <>
              {/* A project always goes out for pricing — keep the field honest and implicit. */}
              <input type="hidden" name="needsPricing" value="yes" />
              <p className="mt-2 text-[13px] text-gray-dark">
                Bid / measurement work. Projects always go out for pricing, so this becomes an
                opportunity in the pipeline.
              </p>
            </>
          ) : (
            <div className="mt-3">
              <span className={labelClass}>Needs pricing?</span>
              <div className="flex flex-wrap gap-2">
                <InlineRadio
                  name="needsPricing"
                  value="yes"
                  checked={needsPricing === "yes"}
                  onChange={setNeedsPricing}
                  label="Yes — send to pipeline"
                />
                <InlineRadio
                  name="needsPricing"
                  value="no"
                  checked={needsPricing === "no"}
                  onChange={setNeedsPricing}
                  label="No — priced already"
                />
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <span className={labelClass}>Items</span>
            <div className="space-y-2">
              {items.map((row, index) => {
                const isLastRow = index === items.length - 1;
                return (
                  <div key={row.key} className="flex items-end gap-2">
                    <label className="block flex-1">
                      <span className="sr-only">Item name</span>
                      <input
                        name="itemName"
                        autoFocus={row.key === autoFocusKey}
                        value={row.name}
                        onChange={(e) => updateItem(row.key, { name: e.target.value })}
                        onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                        placeholder="e.g. Double convection oven"
                        className={inputClass}
                      />
                    </label>
                    <label className="block flex-1">
                      <span className="sr-only">Item details</span>
                      <input
                        name="itemDetails"
                        value={row.details}
                        onChange={(e) => updateItem(row.key, { details: e.target.value })}
                        onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                        placeholder="Brand, model, notes…"
                        className={inputClass}
                      />
                    </label>
                    <label className="block w-16">
                      <span className="sr-only">Quantity</span>
                      <input
                        name="itemQty"
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(e) => updateItem(row.key, { qty: e.target.value })}
                        onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(row.key)}
                      disabled={items.length === 1}
                      aria-label="Remove item"
                      className="btn btn-danger btn-sm mb-0.5 transition-colors active:scale-[0.99] disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="btn btn-sm mt-3 transition-colors active:scale-[0.99]"
            >
              + Add item
            </button>

            <label className="mt-4 block">
              <span className={labelClass}>Notes for the team</span>
              <textarea name="notes" rows={2} className={inputClass} />
            </label>
          </div>

          {orderType === "project" ? (
            <details className="card card-flush mt-5">
              <summary className="cursor-pointer px-4 py-3 marker:text-gray">
                <span className="section-label !mb-0 !inline">Project details</span>
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Facility type</span>
                  <input name="facilityType" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Menu</span>
                  <input name="menu" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Dimensions of room</span>
                  <input name="roomDimensions" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Wall measurements</span>
                  <input name="wallMeasurements" className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Delivery type</span>
                  <select
                    name="deliveryType"
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value as "curbside" | "inside")}
                    className={inputClass}
                  >
                    <option value="curbside">Curbside</option>
                    <option value="inside">Inside</option>
                  </select>
                </label>
                {deliveryType === "inside" ? (
                  <label className="block">
                    <span className={labelClass}>How large are the openings?</span>
                    <input name="openingSize" className={inputClass} />
                  </label>
                ) : (
                  <div />
                )}
                {deliveryType === "inside" ? (
                  <div className="banner-warn sm:col-span-2">
                    Inside delivery: confirm the openings fit before ordering. Equipment that will
                    not fit through the door comes back with a restocking fee — tell the client up
                    front.
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <span className={labelClass}>Installation needed?</span>
                  <div className="flex gap-2">
                    <InlineRadio
                      name="installationNeeded"
                      value="yes"
                      checked={installationNeeded === "yes"}
                      onChange={setInstallationNeeded}
                      label="Yes"
                    />
                    <InlineRadio
                      name="installationNeeded"
                      value="no"
                      checked={installationNeeded === "no"}
                      onChange={setInstallationNeeded}
                      label="No"
                    />
                  </div>
                </div>
              </div>
            </details>
          ) : null}

          {openSection < 3 ? (
            <NextButton onClick={() => setOpenSection(3)}>Next — when do they need it?</NextButton>
          ) : null}
        </Section>

        {/* ============ 3 — When & submit ============ */}
        <Section
          index={3}
          title="When & submit"
          locked={openSection < 3}
          lockedHint="Answer step 2 first."
        >
          <label className="block max-w-xs">
            <span className={labelClass}>When do you need it?</span>
            <input type="date" name="neededByDate" className={inputClass} />
          </label>

          {/* Salesperson is the sidebar identity, not a dropdown to fill in mid-call. */}
          <div className="mt-4">
            {showSalespersonPicker ? (
              <label className="block max-w-xs">
                <span className={labelClass}>Salesperson</span>
                <select
                  name="salespersonId"
                  className={inputClass}
                  value={salespersonId}
                  onChange={(e) => {
                    setSalespersonOverride(e.target.value);
                    rememberSalesperson(e.target.value);
                  }}
                >
                  <option value="">— unassigned —</option>
                  {salespeople.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.id === rememberedSalespersonId ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-[13px] text-gray-dark">
                Submitting as{" "}
                <span className="font-medium text-ink">
                  {salespersonName ?? "whoever is signed in"}
                </span>
                <span className="mx-1.5 text-gray">·</span>
                <button
                  type="button"
                  onClick={() => setShowSalespersonPicker(true)}
                  className="text-primary transition-colors hover:underline"
                >
                  change
                </button>
                {/* The picker is hidden, so the value still has to reach the action. */}
                <input type="hidden" name="salespersonId" value={salespersonId} />
              </p>
            )}
          </div>

          <div className="mt-5 rounded-[10px] border border-border bg-panel p-3 text-[13px] text-gray-dark">
            <p>
              <span className="font-medium text-ink">{clientLabel}</span>
              <span className="mx-1.5 text-gray">·</span>
              {contactSummary}
            </p>
            <p className="mt-1">
              {orderType === "project" ? "Project" : "Order"}
              <span className="mx-1.5 text-gray">·</span>
              {namedItemCount} item{namedItemCount === 1 ? "" : "s"}
              <span className="mx-1.5 text-gray">·</span>
              {goesToPipeline ? "goes to the pipeline" : "becomes an order straight away"}
            </p>
          </div>
        </Section>
      </div>

      {/* ---------------- sticky outcome bar ---------------- */}
      <div className="sticky bottom-0 z-10 mt-5">
        <div className="card flex flex-wrap items-center justify-between gap-4 bg-surface/90 backdrop-blur">
          <p className="text-[13px] text-gray-dark">
            <span className="font-medium text-ink">
              {namedItemCount} item{namedItemCount === 1 ? "" : "s"}
            </span>
            <span className="mx-1.5 text-gray">·</span>
            {orderType === "project" ? "Project" : "Order"}
            <span className="mx-1.5 text-gray">·</span>
            <span className={clientReady ? "" : "text-gray"}>{clientLabel}</span>
          </p>
          {clientReady && openSection >= 3 ? (
            <PendingButton
              className="btn btn-primary active:scale-[0.99]"
              pendingText={goesToPipeline ? "Creating opportunity…" : "Creating order…"}
            >
              {goesToPipeline ? "Create opportunity" : "Create order"}
            </PendingButton>
          ) : (
            // Why the button is dead has to be readable, not just a hover tooltip.
            <div className="flex flex-wrap items-center gap-2.5">
              <p id="intake-cta-reason" className="text-[13px] font-medium text-ink">
                {clientReady ? "Work through the steps above" : "Pick or create a business first"}
              </p>
              <button
                type="button"
                disabled
                aria-describedby="intake-cta-reason"
                className="btn btn-primary cursor-not-allowed opacity-50"
              >
                {goesToPipeline ? "Create opportunity" : "Create order"}
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

function NewContactFields({
  firstName,
  onFirstNameChange,
}: {
  firstName: string;
  onFirstNameChange: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>First name</span>
        <input
          name="newContactFirstName"
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          className={inputClass}
        />
        {/*
          A blank first name silently skips contact creation on the server. Saying so
          here turns a surprise ("where did the person I typed go?") into a choice.
        */}
        {firstName.trim() === "" ? (
          <span className="mt-1 block text-xs text-gray">
            No contact will be created — the rest of these fields are saved with a name.
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className={labelClass}>Last name</span>
        <input name="newContactLastName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Title</span>
        {/* Free text — a fixed list hid people's real jobs. Stored as typed. */}
        <input
          name="newContactTitle"
          list="intake-title-suggestions"
          placeholder="e.g. Head Chef, Owner"
          className={inputClass}
        />
        <datalist id="intake-title-suggestions">
          <option value="Manager" />
          <option value="Purchasing" />
          <option value="Billing" />
          <option value="Owner" />
          <option value="Head Chef" />
        </datalist>
      </label>
      <label className="block">
        <span className={labelClass}>Email</span>
        <input type="email" name="newContactEmail" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Phone</span>
        <input name="newContactPhone" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Extension</span>
        <input name="newContactPhoneExt" className={inputClass} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Cell</span>
        <input name="newContactCellPhone" className={inputClass} />
      </label>
    </div>
  );
}
