// Local presentational helpers for the /contacts module.

// One avatar component app-wide: circle for a person, rounded square for a
// business. Re-exported here so the contacts pages import from one place.
export { Avatar } from "@/lib/Avatar";

// Contact-detail links live in one shared file now (phonebook treatment app-wide).
export { PhoneLink, EmailLink } from "@/lib/ContactLinks";

/**
 * Detail-page header (matches the /companies treatment): back link · title ·
 * badges, and exactly ONE contextual primary action on the right.
 */
export { DetailHeader } from "@/lib/PageLayout";

/** Muted italic stand-in - never a bare dash. */
function Empty({ children = "not set" }: { children?: React.ReactNode }) {
  return <span className="empty-value">{children}</span>;
}

/**
 * One label/value line in a detail card. An empty value drops the row entirely
 * unless `emptyLabel` is given, in which case absence is itself information.
 */
export function DetailRow({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: React.ReactNode;
  emptyLabel?: string;
}) {
  const isEmpty = value === null || value === undefined || value === false || value === "";
  if (isEmpty && !emptyLabel) return null;
  return (
    <div className="flex gap-4 py-2 text-[13px]">
      <div className="w-40 shrink-0 text-gray-dark">{label}</div>
      <div className="min-w-0 break-words text-ink">
        {isEmpty ? <Empty>{emptyLabel}</Empty> : value}
      </div>
    </div>
  );
}

export function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Null when there is no date - callers decide how to say "nothing here". */
export function fmtDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

/** Visible required marker. The control's own `required` is what AT announces. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-gray-dark">
      {" *"}
    </span>
  );
}

export { PageHeader } from "@/lib/PageLayout";

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <input
        type={type}
        // Phone-shaped fields get the phone keypad on touch devices.
        inputMode={type === "tel" ? "tel" : undefined}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="input-klyne w-full"
      />
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  includeBlank,
  required,
  className,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string | null;
  includeBlank?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="input-klyne w-full"
      >
        {includeBlank !== undefined ? <option value="">{includeBlank}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        className="input-klyne w-full"
      />
    </label>
  );
}

const CONTACT_TITLES = [
  { value: "manager", label: "Manager" },
  { value: "purchasing", label: "Purchasing" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Other" },
] as const;

/**
 * Title is free text - a four-option dropdown hid people's real jobs. The common
 * ones are offered as suggestions; whatever is typed is stored exactly as typed.
 */
export function TitleField({
  defaultValue,
  name = "title",
  label = "Title",
}: {
  defaultValue?: string | null;
  name?: string;
  label?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        name={name}
        list="contact-title-suggestions"
        defaultValue={defaultValue ?? ""}
        placeholder="e.g. Head Chef, Owner, Purchasing"
        className="input-klyne w-full"
      />
      <datalist id="contact-title-suggestions">
        {CONTACT_TITLES.map((t) => (
          <option key={t.value} value={t.label} />
        ))}
      </datalist>
    </label>
  );
}

export const CONTACT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inactive", label: "Inactive" },
] as const;

// Contact status has no colour map in constants - map onto the shared badge palette.
export const CONTACT_STATUS_BADGES: Record<string, string> = {
  active: "badge-green",
  onboarding: "badge-blue",
  inactive: "badge-gray",
};
