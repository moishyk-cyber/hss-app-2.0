// Local presentational helpers for the /pipeline module.
import { BackLink } from "@/lib/BackLink";
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

/**
 * Won and Lost are NOT reachable from a stage dropdown - they are side-effectful
 * closes (order + payment / lost reason) that only Mark Won / Mark Lost perform.
 * changeOpportunityStage rejects them server-side; these keep them off the menus.
 */
export const CLOSED_STAGES: readonly string[] = ["won", "lost"];

export const OPEN_STAGES = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s.value));

/**
 * Options for a stage picker: the open stages, plus the record's own stage when it
 * is already closed, so the pill still shows "Won"/"Lost" instead of a raw value.
 */
export function stageOptions(current: string): { value: string; label: string }[] {
  const open = OPEN_STAGES.map((s) => ({ value: s.value as string, label: s.label as string }));
  if (!CLOSED_STAGES.includes(current)) return open;
  const closed = OPPORTUNITY_STAGES.find((s) => s.value === current);
  return closed ? [...open, { value: closed.value as string, label: closed.label as string }] : open;
}

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
      {/* One back control everywhere - @/lib/BackLink (Aug 31 feedback). */}
      <BackLink href={backHref} label={backLabel} />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
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
      <div className="w-44 shrink-0 text-gray-dark">{label}</div>
      <div className="min-w-0 break-words text-ink">
        {isEmpty ? <Empty>{emptyLabel}</Empty> : value}
      </div>
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

export function dateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function fmtMoney(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** A follow-up is overdue once its day is behind us. */
export function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}
