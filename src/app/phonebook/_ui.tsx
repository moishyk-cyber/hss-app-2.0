// Local presentational helpers for the /phonebook directory.
import { COMPANY_TYPES, labelFor } from "@/lib/constants";

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

/** Dialable phone link — this is a phone book, tapping a number should call it. */
export function PhoneLink({
  phone,
  ext,
  className,
}: {
  phone: string | null;
  ext?: string | null;
  className?: string;
}) {
  if (!phone) return <span className="text-gray">—</span>;
  const dial = phone.replace(/[^\d+]/g, "");
  return (
    <a href={`tel:${dial}${ext ? `,${ext}` : ""}`} className={`transition-colors hover:text-accent ${className ?? ""}`}>
      {phone}
      {ext ? <span className="text-gray"> x{ext}</span> : null}
    </a>
  );
}

export function EmailLink({ email, className }: { email: string | null; className?: string }) {
  if (!email) return <span className="text-gray">—</span>;
  return (
    <a href={`mailto:${email}`} className={`truncate transition-colors hover:text-accent ${className ?? ""}`}>
      {email}
    </a>
  );
}
