// Local presentational helpers for the /pipeline module.
import {
  DELIVERY_STATUSES,
  OPPORTUNITY_STAGES,
  RFQ_STATUSES,
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

const RFQ_COLORS: Record<string, string> = {
  needs_pricing: "bg-amber-100 text-amber-800",
  rfq_sent: "bg-blue-100 text-blue-800",
  quote_received: "bg-cyan-100 text-cyan-800",
  priced_in_autoquotes: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  removed: "bg-gray-200 text-gray-600",
};

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        STAGE_COLORS[stage] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {labelFor(OPPORTUNITY_STAGES, stage)}
    </span>
  );
}

export function RfqBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        RFQ_COLORS[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
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
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
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
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <div className="w-44 shrink-0 text-gray-500">{label}</div>
      <div className="min-w-0 break-words text-gray-900">{value || "—"}</div>
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        name={name}
        step={step}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
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
    <label className="flex items-center gap-2 pt-5 text-sm text-gray-700">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-gray-300"
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
