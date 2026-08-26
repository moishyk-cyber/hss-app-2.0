// Local presentational helpers for the /companies module.
import Link from "next/link";
import { COMPANY_TYPES, COMPANY_VERTICALS, labelFor } from "@/lib/constants";

// Company type has no colour map in constants — map onto the shared badge palette.
const TYPE_BADGES: Record<string, string> = {
  lead: "badge-blue",
  customer: "badge-green",
  lost_lead: "badge-gray",
  vendor: "badge-yellow",
  supplier: "badge-orange",
  installer: "badge-blue",
  delivery_partner: "badge-yellow",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${TYPE_BADGES[type] ?? "badge-gray"}`}>
      {labelFor(COMPANY_TYPES, type)}
    </span>
  );
}

export function VerticalLabel({ vertical }: { vertical: string | null }) {
  return <>{labelFor(COMPANY_VERTICALS, vertical)}</>;
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

/**
 * Detail-page header (UX_FLOW §H): back link · title · badges, and exactly ONE
 * contextual primary action on the right. Everything else stays secondary.
 */
export function DetailHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  badges,
  action,
  secondary,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string | null;
  badges?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs text-gray-dark transition-colors hover:text-accent"
      >
        <span aria-hidden>←</span> {backLabel}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{title}</h1>
            {badges}
          </div>
          {subtitle ? <p className="page-sub">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {secondary}
          {action}
        </div>
      </div>
    </div>
  );
}

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

/** Visible required marker. The input's own `required` is what AT announces. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-accent">
      {" *"}
    </span>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
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
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className="input-klyne w-full"
      />
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

export function Checkbox({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 pt-6 text-[13px] text-ink">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-border accent-accent"
      />
      {label}
    </label>
  );
}

export function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}

export function fmtMoney(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border py-2 text-[13px] last:border-b-0">
      <div className="w-40 shrink-0 text-gray-dark">{label}</div>
      <div className="min-w-0 break-words text-ink">{value || "—"}</div>
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
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
