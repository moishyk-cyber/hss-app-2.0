// Local presentational helpers for the /pipeline module.
import {
  DELIVERY_STATUSES,
  OPPORTUNITY_STAGES,
  RFQ_STATUSES,
  RFQ_STATUS_COLORS,
  STAGE_COLORS,
  labelFor,
} from "@/lib/constants";

export const ORDER_TYPES = [
  { value: "project", label: "Project" },
  { value: "order", label: "Order" },
] as const;

export const DELIVERY_TYPES = [
  { value: "curbside", label: "Curbside" },
  { value: "inside", label: "Inside" },
] as const;

export const DESIGN_STATUSES = [
  { value: "none", label: "None" },
  { value: "rendering_in_progress", label: "Rendering in progress" },
  { value: "rendering_approved", label: "Rendering approved" },
] as const;

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`badge ${STAGE_COLORS[stage] ?? "badge-gray"}`}>
      {labelFor(OPPORTUNITY_STAGES, stage)}
    </span>
  );
}

export function RfqBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${RFQ_STATUS_COLORS[status] ?? "badge-gray"}`}>
      {labelFor(RFQ_STATUSES, status)}
    </span>
  );
}

export function DeliveryLabel({ status }: { status: string }) {
  return <>{labelFor(DELIVERY_STATUSES, status)}</>;
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

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border py-2 text-[13px] last:border-b-0">
      <div className="w-44 shrink-0 text-gray-dark">{label}</div>
      <div className="min-w-0 break-words text-ink">{value || "—"}</div>
    </div>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  step,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  step?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">{label}</span>
      <input
        type={type}
        name={name}
        step={step}
        required={required}
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
  className,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string | null;
  includeBlank?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className="input-klyne w-full">
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
        className="h-4 w-4 rounded border-border accent-blue"
      />
      {label}
    </label>
  );
}

export function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}

export function dateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function fmtMoney(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
