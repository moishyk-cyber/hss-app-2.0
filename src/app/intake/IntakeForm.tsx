"use client";

// Intake: ONE top-to-bottom column of numbered sections that unlock as they're
// answered. It is a single <form> - progressive disclosure only hides what
// hasn't been reached yet, so nothing is a separate route or a lost draft.
//
// Two rules the layout depends on:
// - Validation is inline and early. Submit stays disabled until there's a
//   business AND at least one item with a name and a quantity of 1+; phone and
//   email formats complain on the field itself, not three steps later.
// - Drafts survive. Everything typed autosaves to this browser, a refresh
//   offers to restore it, and a successful submit clears it silently.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FormAlert, PendingButton } from "@/lib/ui";
import { readStoredUserId, storeUserId } from "@/lib/identityClient";
import { BusinessCombobox } from "../companies/BusinessCombobox";
import { submitIntake } from "./actions";

const MAX_COMPANY_RESULTS = 8;
const MAX_CONTACT_RESULTS = 8;

const DRAFT_KEY = "hss.intakeDraft";
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function subscribeToStoredSalesperson(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The server has no localStorage, so it always renders "unassigned". */
function noStoredSalesperson(): string | null {
  return null;
}

// Hydration-safe mounted flag (no setState-in-effect).
const noopSubscribe = () => () => {};
const clientTrue = () => true;
const serverFalse = () => false;

type IntakeContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  companyId: string | null;
};

type IntakeLocation = {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
};

type IntakeCompany = {
  id: string;
  name: string;
  deliveryAddress: string | null;
  locationName: string | null;
  /** Sites on file for this business - the location picker in step 1. */
  locations: IntakeLocation[];
};

type ItemRow = { key: number; name: string; details: string; qty: string; unitPrice: string };

/** Everything a saved draft needs to rebuild the form. */
type IntakeDraft = {
  savedAt: number;
  /** Set the moment the form submits; a later clean mount treats it as done. */
  submitting?: boolean;
  ui: {
    openSection: number;
    clientMode: "existing" | "new";
    companyQuery: string;
    companyId: string;
    newCompanyName: string;
    /** "existing" = a saved location (or the address on file); "new" = typed here. */
    locationMode: "existing" | "new";
    locationId: string;
    saveLocation: boolean;
    contactMode: "existing" | "new";
    contactQuery: string;
    contactId: string;
    newContactFirstName: string;
    orderType: "project" | "order";
    deliveryType: "curbside" | "inside";
    installationNeeded: string;
    needsPricing: string;
    neededByDate: string;
    quoteDueDate: string;
    items: ItemRow[];
    fieldValues: Record<string, string>;
  };
  /** Raw values of the UNCONTROLLED inputs, keyed by input name. */
  fields: Record<string, string | string[]>;
};

/** Input names whose values live in React state - never restored via the DOM. */
const CONTROLLED_FIELDS = new Set([
  "clientMode",
  "contactMode",
  "orderType",
  "needsPricing",
  "installationNeeded",
  "companyId",
  "contactId",
  "salespersonId",
  "itemName",
  "itemDetails",
  "itemQty",
  "itemUnitPrice",
  "locationId",
  "saveLocation",
  "newCompanyName",
  "newContactFirstName",
  "deliveryType",
  "newCompanyPhone",
  "newCompanyCellPhone",
  "newCompanyEmail",
  "newContactPhone",
  "newContactCellPhone",
  "newContactEmail",
  "neededByDate",
  "quoteDueDate",
]);

function readDraft(): IntakeDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntakeDraft;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.ui) return null;
    if (Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

const inputClass = "input-klyne w-full";
const labelClass = "field-label";

/** The site a picker should start on: the default one, else the first on file. */
function defaultLocationOf(company: IntakeCompany | null | undefined): IntakeLocation | null {
  const list = company?.locations ?? [];
  return list.find((l) => l.isDefault) ?? list[0] ?? null;
}

function contactName(contact: IntakeContact): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

/** null when fine or empty; a message when the text can't be a phone number. */
function phoneProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || !/^[0-9+()\-.\s,xX#*\/]+$/.test(t)) {
    return "That doesn't look like a phone number.";
  }
  return null;
}

/** null when fine or empty; a message when the text can't be an email. */
function emailProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^\S+@\S+\.\S+$/.test(t) ? null : "That doesn't look like an email address.";
}

const FIELD_VALIDATORS: Record<string, (v: string) => string | null> = {
  newCompanyPhone: phoneProblem,
  newCompanyCellPhone: phoneProblem,
  newCompanyEmail: emailProblem,
  newContactPhone: phoneProblem,
  newContactCellPhone: phoneProblem,
  newContactEmail: emailProblem,
};

function rowQtyValid(row: ItemRow): boolean {
  const qty = Number.parseInt(row.qty.trim(), 10);
  return Number.isFinite(qty) && qty >= 1;
}

/** Prices are optional; a typed one has to be real money. */
function priceProblem(raw: string): boolean {
  const t = raw.trim();
  if (t === "") return false;
  const n = Number(t);
  return !Number.isFinite(n) || n <= 0;
}

function priceValue(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * One numbered step of the call. A locked section shows its number and title so
 * the whole shape of the form is visible from the start - it just can't be
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
  // Location: a saved site on the business, or one typed here (which is saved
  // back onto the business unless the caller unticks it).
  const [locationMode, setLocationMode] = useState<"existing" | "new">("existing");
  const [locationId, setLocationId] = useState(
    initialCompany ? (defaultLocationOf(initialCompany)?.id ?? "") : ""
  );
  const [saveLocation, setSaveLocation] = useState(true);
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [contactQuery, setContactQuery] = useState("");
  const [contactId, setContactId] = useState("");
  // Tracked only so the form can say out loud that a blank name creates no contact -
  // the server stays permissive here, because mid-call speed beats a blocking error.
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [showSalespersonPicker, setShowSalespersonPicker] = useState(false);
  const [salespersonOverride, setSalespersonOverride] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<"project" | "order">("project");
  const [deliveryType, setDeliveryType] = useState<"curbside" | "inside">("curbside");
  const [installationNeeded, setInstallationNeeded] = useState("no");
  const [needsPricing, setNeedsPricing] = useState("yes");
  const [neededByDate, setNeededByDate] = useState("");
  const [quoteDueDate, setQuoteDueDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([
    { key: 1, name: "", details: "", qty: "1", unitPrice: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);
  // Newly-added rows mount with autoFocus, which lands the caret in their name field.
  const [autoFocusKey, setAutoFocusKey] = useState(0);

  // Phone/email fields are validated inline, on the field itself.
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  // ---------------- draft autosave / restore ----------------
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useSyncExternalStore(noopSubscribe, clientTrue, serverFalse);
  // The draft found at mount. Lazy initializer: null on the server, the stored
  // draft on the client - and the banner below only renders once `mounted` is
  // true, so hydration output stays identical either way.
  const [initialDraft, setInitialDraft] = useState<IntakeDraft | null>(() =>
    typeof window === "undefined" ? null : readDraft()
  );
  const skipFirstAutosave = useRef(true);

  // A draft marked "submitting" on a mount with no error means the submit
  // succeeded (we came back fresh) - drop it from storage. The banner already
  // excludes it, so no state changes here.
  useEffect(() => {
    if (initialDraft?.submitting && !error) clearDraft();
  }, [initialDraft, error]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function buildDraft(submitting: boolean): IntakeDraft | null {
    const form = formRef.current;
    if (!form) return null;
    const fields: Record<string, string | string[]> = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string") continue;
      const existing = fields[k];
      if (existing === undefined) fields[k] = v;
      else if (Array.isArray(existing)) existing.push(v);
      else fields[k] = [existing, v];
    }
    return {
      savedAt: Date.now(),
      submitting,
      ui: {
        openSection,
        clientMode,
        companyQuery,
        companyId,
        newCompanyName,
        locationMode,
        locationId,
        saveLocation,
        contactMode,
        contactQuery,
        contactId,
        newContactFirstName,
        orderType,
        deliveryType,
        installationNeeded,
        needsPricing,
        neededByDate,
        quoteDueDate,
        items,
        fieldValues,
      },
      fields,
    };
  }

  function saveDraftNow(submitting = false) {
    const draft = buildDraft(submitting);
    if (!draft) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage full/blocked - the app still works, drafts just don't persist
    }
  }

  function scheduleDraftSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraftNow(false), 500);
  }

  // Controlled-state changes (segmented toggles, item rows, pickers) don't fire
  // the form's onChange - autosave on them here. First run is the mount itself.
  useEffect(() => {
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
    scheduleDraftSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    openSection,
    clientMode,
    companyQuery,
    companyId,
    newCompanyName,
    locationMode,
    locationId,
    saveLocation,
    contactMode,
    contactQuery,
    contactId,
    newContactFirstName,
    orderType,
    deliveryType,
    installationNeeded,
    needsPricing,
    neededByDate,
    quoteDueDate,
    items,
    fieldValues,
  ]);

  function restoreDraft() {
    const d = initialDraft;
    if (!d) return;
    const ui = d.ui;
    setOpenSection(ui.openSection);
    setClientMode(ui.clientMode);
    setCompanyQuery(ui.companyQuery);
    setCompanyId(ui.companyId);
    setNewCompanyName(ui.newCompanyName);
    // Drafts saved before locations existed have none of these three.
    setLocationMode(ui.locationMode ?? "existing");
    setLocationId(ui.locationId ?? "");
    setSaveLocation(ui.saveLocation ?? true);
    setContactMode(ui.contactMode);
    setContactQuery(ui.contactQuery);
    setContactId(ui.contactId);
    setNewContactFirstName(ui.newContactFirstName);
    setOrderType(ui.orderType);
    setDeliveryType(ui.deliveryType);
    setInstallationNeeded(ui.installationNeeded);
    setNeedsPricing(ui.needsPricing);
    // Drafts saved before the required dates existed have neither.
    setNeededByDate(ui.neededByDate ?? "");
    setQuoteDueDate(ui.quoteDueDate ?? "");
    if (ui.items.length > 0) {
      // Older drafts have no per-item price field.
      setItems(ui.items.map((r) => ({ ...r, unitPrice: r.unitPrice ?? "" })));
      setNextKey(Math.max(...ui.items.map((r) => r.key)) + 1);
    }
    setFieldValues(ui.fieldValues ?? {});
    setInitialDraft(null);
    // The uncontrolled inputs (addresses, notes, dates) render after the state
    // above lands - fill them straight from the saved DOM values then.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const form = formRef.current;
        if (!form) return;
        for (const [name, v] of Object.entries(d.fields)) {
          if (CONTROLLED_FIELDS.has(name)) continue;
          const el = form.elements.namedItem(name);
          const value = Array.isArray(v) ? v[0] : v;
          if (
            (el instanceof HTMLInputElement &&
              el.type !== "radio" &&
              el.type !== "checkbox" &&
              el.type !== "hidden") ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement
          ) {
            if (!el.value) el.value = value;
          }
        }
      })
    );
  }

  function discardDraft() {
    clearDraft();
    setInitialDraft(null);
  }

  const showDraftBanner =
    mounted &&
    initialDraft != null &&
    // A submitting draft with no error is a finished submit, not a lost draft.
    !(initialDraft.submitting && !error);

  // ---------------- identity ----------------
  // No auth yet: the sidebar's "Working as" identity is who this intake belongs to.
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
  const companyLocations = selectedCompany?.locations ?? [];
  const selectedLocation = companyLocations.find((l) => l.id === locationId) ?? null;

  /** Point the location picker at a business (or clear it when the pick is dropped). */
  function resetLocation(company: IntakeCompany | null) {
    setLocationMode("existing");
    setLocationId(defaultLocationOf(company)?.id ?? "");
    setSaveLocation(true);
  }

  // Contacts are loaded whole and filtered here - the picked business is client state.
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

  // A deal without a client is not useful - keep everything downstream closed
  // until one is picked (or a new one is being typed).
  const clientReady =
    clientMode === "new" ? newCompanyName.trim() !== "" : companyId !== "";

  // ---------------- validation ----------------
  const validItems = items.filter((r) => r.name.trim() !== "" && rowQtyValid(r));
  const badQtyRows = items.filter((r) => r.name.trim() !== "" && !rowQtyValid(r));
  const badPriceRows = items.filter((r) => priceProblem(r.unitPrice));
  const pricesReady = badPriceRows.length === 0;
  const itemsReady = validItems.length > 0 && badQtyRows.length === 0 && pricesReady;
  /** What the typed item prices add up to - the fallback order value. */
  const itemsTotal = validItems.reduce(
    (sum, r) => sum + priceValue(r.unitPrice) * Number.parseInt(r.qty.trim(), 10),
    0
  );
  const agreedTotal = itemsTotal;

  /** Which validated fields are actually on screen right now? */
  const activeValidatedFields = [
    ...(clientMode === "new" ? ["newCompanyPhone", "newCompanyCellPhone", "newCompanyEmail"] : []),
    ...(clientMode === "new" || contactMode === "new"
      ? ["newContactPhone", "newContactCellPhone", "newContactEmail"]
      : []),
  ];
  const fieldErrors: Record<string, string> = {};
  for (const name of activeValidatedFields) {
    const problem = FIELD_VALIDATORS[name]?.(fieldValues[name] ?? "");
    if (problem) fieldErrors[name] = problem;
  }
  const fieldsReady = Object.keys(fieldErrors).length === 0;

  const blockReason = !clientReady
    ? "Pick or create a business first"
    : badQtyRows.length > 0
      ? "Every item needs a quantity of at least 1"
      : validItems.length === 0
        ? "Add at least one item with a name"
        : !pricesReady
          ? "A typed price has to be more than $0"
          : !fieldsReady
            ? "Fix the highlighted phone/email fields"
            : !neededByDate.trim()
              ? "Add a delivery due date"
              : goesToPipeline && !quoteDueDate.trim()
                ? "Add a due date"
                : openSection < 3
                  ? "Work through the steps above"
                  : null;

  const clientLabel =
    clientMode === "new"
      ? newCompanyName.trim() || "New client"
      : (selectedCompany?.name ?? "No client selected");

  function setField(name: string, value: string) {
    setFieldValues((v) => ({ ...v, [name]: value }));
  }

  function touchField(name: string) {
    setTouchedFields((t) => (t[name] ? t : { ...t, [name]: true }));
  }

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
    setItems((rows) => [
      ...rows,
      { key: nextKey, name: "", details: "", qty: "1", unitPrice: "" },
    ]);
    setAutoFocusKey(nextKey);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  /** Enter inside an item row never submits - it adds the next row instead. */
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
      ref={formRef}
      action={submitIntake}
      onSubmit={() => {
        rememberSalesperson(salespersonId);
        // Snapshot as "submitting": if the server bounces back with an error,
        // the draft is still here; if it succeeds, the next visit clears it.
        saveDraftNow(true);
      }}
      onChange={scheduleDraftSave}
      className="mx-auto max-w-3xl pb-4"
    >
      {error === "duplicate_company" ? (
        <FormAlert>
          <strong>{duplicateCompany ?? "That business"}</strong> is already on file - nothing was
          saved. Search for it above and pick the existing record instead of creating a second one.
          If it doesn&rsquo;t show up in the search, open{" "}
          <Link href="/companies" className="underline">
            Businesses
          </Link>{" "}
          and check its type: only customers and leads appear in this picker.
        </FormAlert>
      ) : error === "items_required" ? (
        <FormAlert>
          Nothing was saved - the request needs at least one item with a name and a quantity of 1
          or more.
        </FormAlert>
      ) : error === "dates_required" ? (
        <FormAlert>
          Nothing was saved - a delivery due date is required, and a due date is required whenever
          the deal still needs pricing.
        </FormAlert>
      ) : error === "save_failed" ? (
        <FormAlert>Something went wrong while saving. Please try again.</FormAlert>
      ) : error === "not_allowed" ? (
        <FormAlert>
          That role can&rsquo;t do this. Switch &quot;Working as&quot; in the sidebar or ask an
          admin.
        </FormAlert>
      ) : null}

      {showDraftBanner ? (
        <div className="banner-info mb-5 flex flex-wrap items-center justify-between gap-3">
          <span>
            You have an unsaved intake draft from{" "}
            {new Date(initialDraft!.savedAt).toLocaleString()}.
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn btn-sm btn-primary" onClick={restoreDraft}>
              Restore draft
            </button>
            <button type="button" className="btn btn-sm" onClick={discardDraft}>
              Discard
            </button>
          </span>
        </div>
      ) : null}

      {/* hidden mirrors of the branching state so the server action sees plain fields */}
      <input type="hidden" name="clientMode" value={clientMode} />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="orderType" value={orderType} />

      <div className="space-y-5">
        {/* ============ 1 - Who's calling ============ */}
        <Section index={1} title="Who’s calling" hint="Find the business, then the person.">
          {clientMode === "existing" ? (
            <div className="space-y-4">
              <BusinessCombobox
                query={companyQuery}
                setQuery={(next) => {
                  setCompanyQuery(next);
                  // Typing again means they're re-searching - drop the old pick.
                  if (companyId) {
                    setCompanyId("");
                    resetLocation(null);
                    resetContact();
                  }
                }}
                options={companyOptions}
                maxResults={MAX_COMPANY_RESULTS}
                selectedId={companyId}
                onPick={(o) => {
                  setCompanyId(o.id);
                  setCompanyQuery(o.name);
                  resetLocation(companies.find((c) => c.id === o.id) ?? null);
                  resetContact();
                }}
                onCreate={(name) => {
                  setClientMode("new");
                  setNewCompanyName(name);
                  setCompanyId("");
                  resetLocation(null);
                  setContactMode("new");
                  setContactId("");
                  setContactQuery("");
                }}
              />
              {/* The combobox is a display control; this carries the real value. */}
              <input type="hidden" name="companyId" value={companyId} />

              {selectedCompany ? (
                <>
                  {/*
                    --- where is it going? ---
                    The business's saved locations as chips, so the address is
                    picked, not retyped. A location typed here is saved back onto
                    the business unless the caller unticks it.
                  */}
                  <div className="rounded-[10px] border border-border bg-panel p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="section-label !mb-0">Location</span>
                      {locationMode === "new" ? (
                        <button
                          type="button"
                          onClick={() => resetLocation(selectedCompany)}
                          className="text-xs text-gray-dark transition-colors hover:text-ink"
                        >
                          {companyLocations.length > 0
                            ? "Use a saved location"
                            : "Use the address on file"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setLocationMode("new");
                            setLocationId("");
                          }}
                          className="text-xs text-primary transition-colors hover:underline"
                        >
                          {companyLocations.length > 0
                            ? "Add a location"
                            : "Deliver somewhere else"}
                        </button>
                      )}
                    </div>

                    {locationMode === "new" ? (
                      <div className="space-y-3">
                        <label className="block">
                          <span className={labelClass}>Name of location</span>
                          <input
                            name="locationName"
                            autoFocus
                            placeholder="e.g. Second store, Boro Park"
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Delivery address</span>
                          <input
                            name="deliveryAddress"
                            placeholder="Where is this going?"
                            className={inputClass}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            checked={saveLocation}
                            onChange={(e) => setSaveLocation(e.target.checked)}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          Save it as a location on {selectedCompany.name}
                        </label>
                      </div>
                    ) : companyLocations.length > 0 ? (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {companyLocations.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              aria-pressed={l.id === locationId}
                              onClick={() => setLocationId(l.id)}
                              className={`rounded-lg border px-3 py-1.5 text-left text-[13px] transition-colors ${
                                l.id === locationId
                                  ? "border-primary bg-hover text-ink"
                                  : "border-border bg-surface hover:bg-hover"
                              }`}
                            >
                              <span className="font-medium">{l.name}</span>
                              {l.isDefault ? (
                                <span className="ml-1.5 text-xs text-gray">default</span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[13px] text-ink">
                          {selectedLocation ? (
                            selectedLocation.address
                          ) : (
                            <span className="empty-value">Pick where this is going</span>
                          )}
                        </p>
                      </>
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
                    {/* The real values the action reads. */}
                    <input
                      type="hidden"
                      name="locationId"
                      value={locationMode === "existing" ? locationId : ""}
                    />
                    <input
                      type="hidden"
                      name="saveLocation"
                      value={locationMode === "new" && saveLocation ? "1" : "0"}
                    />
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
                            No contact will be created - leave this blank if you didn&rsquo;t catch
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
                          fieldValues={fieldValues}
                          fieldErrors={fieldErrors}
                          touchedFields={touchedFields}
                          onFieldChange={setField}
                          onFieldBlur={touchField}
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
                <ValidatedField
                  label="Phone"
                  name="newCompanyPhone"
                  type="tel"
                  value={fieldValues.newCompanyPhone ?? ""}
                  error={fieldErrors.newCompanyPhone}
                  touched={!!touchedFields.newCompanyPhone}
                  onChange={setField}
                  onBlur={touchField}
                />
                <label className="block">
                  <span className={labelClass}>Extension</span>
                  <input name="newCompanyPhoneExt" className={inputClass} />
                </label>
                <ValidatedField
                  label="Cell phone"
                  name="newCompanyCellPhone"
                  type="tel"
                  value={fieldValues.newCompanyCellPhone ?? ""}
                  error={fieldErrors.newCompanyCellPhone}
                  touched={!!touchedFields.newCompanyCellPhone}
                  onChange={setField}
                  onBlur={touchField}
                />
                <ValidatedField
                  label="Email"
                  name="newCompanyEmail"
                  type="email"
                  value={fieldValues.newCompanyEmail ?? ""}
                  error={fieldErrors.newCompanyEmail}
                  touched={!!touchedFields.newCompanyEmail}
                  onChange={setField}
                  onBlur={touchField}
                />
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
                  <span className="mt-1 block text-xs text-gray">
                    The delivery address and this name become the business&rsquo;s first saved
                    location.
                  </span>
                </label>
              </div>

              <div className="rounded-[10px] border border-border bg-panel p-3">
                <p className="section-label mb-2">Primary contact</p>
                <NewContactFields
                  firstName={newContactFirstName}
                  onFirstNameChange={setNewContactFirstName}
                  fieldValues={fieldValues}
                  fieldErrors={fieldErrors}
                  touchedFields={touchedFields}
                  onFieldChange={setField}
                  onFieldBlur={touchField}
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
              Next - what do they need?
            </NextButton>
          ) : null}
        </Section>

        {/* ============ 2 - What do they need ============ */}
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
              {/* A project always goes out for pricing - keep the field honest and implicit. */}
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
                  label="Yes"
                />
                <InlineRadio
                  name="needsPricing"
                  value="no"
                  checked={needsPricing === "no"}
                  onChange={setNeedsPricing}
                  label="No"
                />
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <span className={labelClass}>Items</span>
            <div className="space-y-2">
              {items.map((row, index) => {
                const isLastRow = index === items.length - 1;
                const qtyBad = row.name.trim() !== "" && !rowQtyValid(row);
                const priceBad = priceProblem(row.unitPrice);
                return (
                  <div key={row.key}>
                    <div className="flex items-end gap-2">
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
                          aria-invalid={qtyBad}
                          className={`${inputClass} ${qtyBad ? "!border-red" : ""}`}
                        />
                      </label>
                      {/* Price it once, on the call, when the price is already known. */}
                      <label className="block w-24">
                        <span className="sr-only">Unit price</span>
                        <input
                          name="itemUnitPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitPrice}
                          onChange={(e) => updateItem(row.key, { unitPrice: e.target.value })}
                          onKeyDown={(e) => onItemKeyDown(e, isLastRow)}
                          aria-invalid={priceBad}
                          placeholder="$ each"
                          className={`${inputClass} ${priceBad ? "!border-red" : ""}`}
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
                    {qtyBad ? (
                      <p role="alert" className="mt-1 text-xs text-red">
                        Quantity has to be at least 1.
                      </p>
                    ) : null}
                    {priceBad ? (
                      <p role="alert" className="mt-1 text-xs text-red">
                        A price has to be more than $0 - leave it blank if it needs quoting.
                      </p>
                    ) : null}
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

            {/*
              The total price is NOT asked here - it is agreed when the deal is
              closed (the Close panel on the deal). An order that is already
              priced only needs its terms written down; its value is what the
              item prices add up to.
            */}
            {goesToPipeline ? null : (
              <div className="mt-4 rounded-[10px] border border-border bg-panel p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <label className="block min-w-56 flex-1">
                    <span className={labelClass}>Terms</span>
                    <textarea
                      name="termsNotes"
                      rows={3}
                      placeholder="e.g. 50% deposit, balance before delivery. Net 30 for the balance."
                      className={inputClass}
                    />
                  </label>
                  <div className="block w-44">
                    <span className={labelClass}>Order total</span>
                    <div className="text-[15px] font-semibold tabular-nums text-ink">
                      {itemsTotal > 0 ? (
                        `$${itemsTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      ) : (
                        <span className="empty-value">add item prices above</span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray">
                  The total is what the item prices add up to. Invoices are added by hand on the
                  order&rsquo;s Invoice tab.
                </p>
              </div>
            )}

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
                    not fit through the door comes back with a restocking fee - tell the client up
                    front.
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <span className={labelClass}>Drawing or attachment</span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="sr-only">Link to the drawing</span>
                      <input
                        name="drawingLink"
                        type="url"
                        placeholder="Paste a link (Google Drive, Dropbox, etc.)"
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="sr-only">Upload the drawing</span>
                      <input
                        name="drawingFile"
                        type="file"
                        accept="application/pdf,image/*"
                        className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-hover file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink`}
                      />
                    </label>
                  </div>
                  <span className="mt-1 block text-xs text-gray">
                    A PDF or a link both work - leave blank if there&rsquo;s no drawing yet.
                  </span>
                </div>
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
            <NextButton
              onClick={() => setOpenSection(3)}
              disabled={!itemsReady}
              disabledReason={
                badQtyRows.length > 0
                  ? "Every item needs a quantity of at least 1"
                  : !pricesReady
                    ? "A typed price has to be more than $0"
                    : "Add at least one item with a name"
              }
            >
              Next - when do they need it?
            </NextButton>
          ) : null}
        </Section>

        {/* ============ 3 - When & submit ============ */}
        <Section
          index={3}
          title="When & submit"
          locked={openSection < 3}
          lockedHint="Answer step 2 first."
        >
          <div className="flex flex-wrap gap-4">
            <label className="block max-w-xs">
              <span className={labelClass}>Delivery due date</span>
              <input
                type="date"
                name="neededByDate"
                required
                value={neededByDate}
                onChange={(e) => setNeededByDate(e.target.value)}
                className={inputClass}
              />
            </label>
            {goesToPipeline ? (
              <label className="block max-w-xs">
                <span className={labelClass}>Due date</span>
                <input
                  type="date"
                  name="estDueDate"
                  required
                  value={quoteDueDate}
                  onChange={(e) => setQuoteDueDate(e.target.value)}
                  className={inputClass}
                />
              </label>
            ) : null}
          </div>

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
                  <option value="">Unassigned</option>
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
              {validItems.length} item{validItems.length === 1 ? "" : "s"}
              {agreedTotal > 0 ? (
                <>
                  <span className="mx-1.5 text-gray">·</span>
                  {`$${agreedTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                </>
              ) : null}
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
              {validItems.length} item{validItems.length === 1 ? "" : "s"}
            </span>
            <span className="mx-1.5 text-gray">·</span>
            {orderType === "project" ? "Project" : "Order"}
            <span className="mx-1.5 text-gray">·</span>
            <span className={clientReady ? "" : "text-gray"}>{clientLabel}</span>
          </p>
          {blockReason == null ? (
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
                {blockReason}
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

/** Controlled input with inline validation (shows its error once touched). */
function ValidatedField({
  label,
  name,
  type = "text",
  value,
  error,
  touched,
  onChange,
  onBlur,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  error?: string;
  touched: boolean;
  onChange: (name: string, value: string) => void;
  onBlur: (name: string) => void;
  className?: string;
}) {
  const showError = touched && !!error;
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={labelClass}>{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={() => onBlur(name)}
        aria-invalid={showError}
        className={`${inputClass} ${showError ? "!border-red" : ""}`}
      />
      {showError ? (
        <span role="alert" className="mt-1 block text-xs text-red">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function NewContactFields({
  firstName,
  onFirstNameChange,
  fieldValues,
  fieldErrors,
  touchedFields,
  onFieldChange,
  onFieldBlur,
}: {
  firstName: string;
  onFirstNameChange: (next: string) => void;
  fieldValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  touchedFields: Record<string, boolean>;
  onFieldChange: (name: string, value: string) => void;
  onFieldBlur: (name: string) => void;
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
            No contact will be created - the rest of these fields are saved with a name.
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className={labelClass}>Last name</span>
        <input name="newContactLastName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Title</span>
        {/* Free text - a fixed list hid people's real jobs. Stored as typed. */}
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
      <ValidatedField
        label="Email"
        name="newContactEmail"
        type="email"
        value={fieldValues.newContactEmail ?? ""}
        error={fieldErrors.newContactEmail}
        touched={!!touchedFields.newContactEmail}
        onChange={onFieldChange}
        onBlur={onFieldBlur}
      />
      <ValidatedField
        label="Phone"
        name="newContactPhone"
        type="tel"
        value={fieldValues.newContactPhone ?? ""}
        error={fieldErrors.newContactPhone}
        touched={!!touchedFields.newContactPhone}
        onChange={onFieldChange}
        onBlur={onFieldBlur}
      />
      <label className="block">
        <span className={labelClass}>Extension</span>
        <input name="newContactPhoneExt" className={inputClass} />
      </label>
      <ValidatedField
        label="Cell"
        name="newContactCellPhone"
        type="tel"
        value={fieldValues.newContactCellPhone ?? ""}
        error={fieldErrors.newContactCellPhone}
        touched={!!touchedFields.newContactCellPhone}
        onChange={onFieldChange}
        onBlur={onFieldBlur}
        className="sm:col-span-2"
      />
    </div>
  );
}
