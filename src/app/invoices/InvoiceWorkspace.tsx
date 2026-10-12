import type { ReactNode } from "react";
import Link from "@/lib/IntentLink";
import { PageHeader } from "@/lib/PageLayout";

export function InvoiceWorkspace({ canEdit, toolbar, children }: {
  canEdit: boolean; toolbar: ReactNode; children: ReactNode;
}) {
  return <div className="space-y-6 pb-12">
    <PageHeader title="Invoices" subtitle="Track deposits and invoices across every order." toolbar={toolbar}>
      {canEdit && <Link href="/invoices/new" className="btn btn-primary">New billing record</Link>}
    </PageHeader>
    {children}
  </div>;
}
