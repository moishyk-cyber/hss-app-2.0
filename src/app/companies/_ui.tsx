// Local presentational helpers for the /companies module.
import { BackLink } from "@/lib/BackLink";
import { COMPANY_TYPES, COMPANY_VERTICALS, labelFor } from "@/lib/constants";

// Company type has no colour map in constants - map onto the shared badge palette.
// Only the client lifecycle carries a status colour: an active customer is green, a
// lead neutral, a dead lead grey. Supply-side partners are categories, not statuses,
// so they stay grey - amber would read as "needs attention" when nothing is wrong,
// and the badge text already says which kind of partner it is.
const TYPE_BADGES: Record<string, string> = {
  lead: "badge-blue",
  customer: "badge-green",
  lost_lead: "badge-gray",
  vendor: "badge-gray",
  supplier: "badge-gray",
  installer: "badge-gray",
  delivery_partner: "badge-gray",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${TYPE_BADGES[type] ?? "badge-gray"}`}>
      {labelFor(COMPANY_TYPES, type)}
    </span>
  );
}

// One avatar component app-wide: rounded square for a business, circle for a
// person. Re-exported here so the companies pages import from one place.
export { Avatar } from "@/lib/Avatar";

// Contact-detail links live in one shared file now (phonebook treatment app-wide).
export { PhoneLink, EmailLink } from "@/lib/ContactLinks";

/** labelFor() falls back to a bare dash - never let that reach the page (§2). */
export function VerticalLabel({ vertical }: { vertical: string | null }) {
  if (!vertical) return <span className="empty-value">not categorised</span>;
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
  avatar,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string | null;
  badges?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  /** Optional avatar that leads the title, so the name reads the same as in lists. */
  avatar?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {/* One back control everywhere - @/lib/BackLink (Aug 31 feedback). */}
      <BackLink href={backHref} label={backLabel} />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {avatar}
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

/** Visible required marker. The input's own `required` is what AT announces. */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-gray-dark">
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
  min,
  max,
  step,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
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
        inputMode={type === "tel" ? "tel" : type === "number" ? "numeric" : undefined}
        name={name}
        required={required}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue ?? ""}
        className="input-klyne w-full"
      />
      {hint ? <span className="mt-1 block text-xs text-gray">{hint}</span> : null}
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
        className="h-4 w-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  );
}

/** Null when there is no date - callers decide how to say "nothing here". */
export function fmtDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export function fmtMoney(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Muted italic stand-in - never a bare dash. See DESIGN_V2.md §2. */
export function Empty({ children = "not set" }: { children?: React.ReactNode }) {
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
