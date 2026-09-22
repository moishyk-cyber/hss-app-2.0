import { notFound } from "next/navigation";
import { can } from "@/lib/permissionsServer";
import { AdminTabs } from "./AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The nav hides the Admin link for non-admins; this makes direct URLs 404 too.
  if (!(await can("admin.manage"))) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Admin</h1>
        <p className="page-sub">Team members and app-wide settings.</p>
      </div>
      <AdminTabs />
      <div>{children}</div>
    </div>
  );
}
