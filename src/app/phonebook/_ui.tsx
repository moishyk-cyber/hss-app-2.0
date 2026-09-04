// Local presentational helpers for the /phonebook directory.
import { COMPANY_TYPES, labelFor } from "@/lib/constants";

// Company type has no colour map in constants - map onto the shared badge palette.
// Kept in step with /companies: only the client lifecycle gets a status colour.
// Supply-side partners are categories, not statuses, so they stay grey rather than
// borrowing amber, which the brand reserves for "needs attention".
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

// Avatar moved to @/lib/Avatar so every list in the app shares it; re-exported
// here so existing phonebook imports keep working.
export { Avatar } from "@/lib/Avatar";

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
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

// Contact-detail links live in one shared file now (phonebook treatment app-wide).
export { PhoneLink, EmailLink } from "@/lib/ContactLinks";
