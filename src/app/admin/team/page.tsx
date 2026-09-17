import { prisma } from "@/lib/prisma";
import { UserRow } from "./UserRow";
import { NewUserForm } from "./NewUserForm";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

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
          <table className="table-klyne min-w-[840px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
