import { PageHeader } from "@/lib/PageLayout";
import { can } from "@/lib/permissionsServer";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UserRow } from "./UserRow";
import { NewUserForm } from "./NewUserForm";
import { openWorkForUsers } from "@/lib/ownership";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  if (!(await can("admin.manage"))) notFound();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  // Include inactive users too: deletion must require reassignment of any
  // remaining open work, regardless of the teammate's current status.
  const openWork = await openWorkForUsers(users.map((u) => u.id));
  const activeUsers = users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));
  const accountOwnerId = await getSetting("account.ownerId");

  return (
    <div className="space-y-8">
      <PageHeader level={2} title="Team" subtitle="Everyone who can be assigned an order, item, or task. Add or update people here — changes show up everywhere immediately."><NewUserForm/></PageHeader>

      {users.length === 0 ? (
        <div className="empty-state">No teammates yet - add the first one above.</div>
      ) : (
        <div className="card card-flush overflow-hidden overflow-x-auto">
          <table className="table-klyne min-w-[840px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isAccountOwner={u.id === accountOwnerId}
                  openWorkCount={openWork.get(u.id)?.total ?? 0}
                  otherActiveUsers={activeUsers.filter((a) => a.id !== u.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
