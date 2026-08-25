// Local presentational helpers for the /contacts module.
import Link from "next/link";

/** Back link for sub-pages (edit forms) where the form's own submit is the one primary. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-1.5 inline-flex items-center gap-1 text-xs text-gray-dark transition-colors hover:text-accent"
    >
      <span aria-hidden>←</span> {label}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

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
      <span className="field-label">{label}</span>
      <input
        type={type}
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
      <span className="field-label">{label}</span>
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

export const CONTACT_TITLES = [
  { value: "manager", label: "Manager" },
  { value: "purchasing", label: "Purchasing" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Other" },
] as const;

/**
 * Title is free text — a four-option dropdown hid people's real jobs. The common
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

// Contact status has no colour map in constants — map onto the shared badge palette.
export const CONTACT_STATUS_BADGES: Record<string, string> = {
  active: "badge-green",
  onboarding: "badge-blue",
  inactive: "badge-gray",
};
