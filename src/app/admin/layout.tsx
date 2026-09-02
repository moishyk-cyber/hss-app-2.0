import { AdminTabs } from "./AdminTabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
