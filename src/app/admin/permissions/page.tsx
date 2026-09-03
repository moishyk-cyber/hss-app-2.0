import { currentUser, getRolePermissions } from "@/lib/permissionsServer";
import { USER_ROLES, labelFor } from "@/lib/constants";
import { PermissionMatrixTable } from "./PermissionMatrix";

export const dynamic = "force-dynamic";

export default async function AdminPermissionsPage() {
  const [matrix, user] = await Promise.all([getRolePermissions(), currentUser()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-label">Permissions by role</h2>
        <p className="page-sub">
          {user
            ? `Working as ${user.name} (${labelFor(USER_ROLES, user.role)}).`
            : "Nobody is picked in \"Working as\" - that identity is the sidebar picker, not a login."}{" "}
          A checked box means that role can do that action. Admin always has everything.
          These checks keep people on their own lane; they are not hard security.
        </p>
      </div>
      <PermissionMatrixTable matrix={matrix} />
    </div>
  );
}
