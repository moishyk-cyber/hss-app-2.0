import { prisma } from "@/lib/prisma";
import { UserRow } from "./UserRow";
import { NewUserForm } from "./NewUserForm";
import { openWorkForUsers } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  // Reliability spec P0-4: every active row needs its open-work count so
  // deactivating shows the real stakes instead of a generic warning, and can
  // require reassignment before it silently strands anything.
  const openWork = await openWorkForUsers(users.filter((u) => u.active).map((u) => u.id));
  const activeUsers = users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-sub">
            Everyone who can be assigned an order, item, or task. Add or update people here -
            changes show up everywhere immediately.
          </p>
        </div>
        <NewUserForm />
      </div>

      {users.length === 0 ? (
        <div className="empty-state">No teammates yet - add the first one above.</div>
      ) : (
        <div className="card card-flush overflow-hidden overflow-x-auto">
          <table className="table-klyne min-w-[680px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
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
