"use client";

// Order detail Service tab: the order's own service issues, plus a quick-add
// form pre-linked to the order (company/location inherited, no picker needed -
// only which line item, if any). Agent D wires this into OrderTabs/page.tsx;
// this file only owns its own rendering.

import { SectionLink as Link } from "@/lib/SectionLink";
import IssueRow, { type IssueRowData } from "../../service/IssueRow";

export type OrderIssuesPanelProps = {
  orderId: string;
  companyId: string | null;
  locationId: string | null;
  issues: IssueRowData[];
  users: { id: string; name: string }[];
  items: { id: string; name: string }[];
};

export default function OrderIssuesPanel({ orderId, issues, users }: OrderIssuesPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label">Service issues</h2>
        <Link fullPage href={`/service/new?orderId=${orderId}`} className="btn btn-sm">Log an issue</Link>
      </div>



      {issues.length === 0 ? (
        <div className="empty-state">
          No service issues logged for this order yet. Use &ldquo;Log an issue&rdquo; above once a customer calls in
          a problem.
        </div>
      ) : (
        <div className="card card-flush overflow-hidden">
          <div className="divide-y divide-border">
            {issues.map((issue) => (
              <IssueRow fullPage key={issue.id} issue={issue} users={users} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
