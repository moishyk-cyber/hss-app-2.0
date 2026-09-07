import Link from "next/link";
import { currentUser, getRolePermissions, permissionsOpenMode } from "@/lib/permissionsServer";
import { USER_ROLES, labelFor } from "@/lib/constants";
import { BadgeSelect } from "@/lib/ui";
import { PermissionMatrixTable } from "./PermissionMatrix";
import { setPermissionsOpenMode } from "./actions";

export const dynamic = "force-dynamic";

const OPEN_MODE_OPTIONS = [
  { value: "on", label: "Open - everyone can do everything" },
  { value: "off", label: "Enforced - use the matrix below" },
] as const;
const OPEN_MODE_COLORS: Record<string, string> = { on: "badge-green", off: "badge-blue" };

export default async function AdminPermissionsPage() {
  const [matrix, user, openMode] = await Promise.all([
    getRolePermissions(),
    currentUser(),
    permissionsOpenMode(),
  ]);

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
        <p className="page-sub">
          Ball in court says whose turn it is; permissions say who is allowed. Set the courts under{" "}
          <Link href="/admin/settings" className="text-blue transition-colors hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

      <div className={`card flex flex-wrap items-center justify-between gap-3 ${openMode ? "border-green" : ""}`}>
        <div>
          <div className="text-sm font-semibold text-ink">Open mode</div>
          <p className="mt-0.5 text-[13px] text-gray-dark">
            {openMode
              ? "Everyone can do everything right now - the matrix below is saved but not enforced. Switch to Enforced when you are ready to lock lanes."
              : "The matrix below is enforced. Switch to Open to let every role do everything again."}
          </p>
        </div>
        <BadgeSelect
          value={openMode ? "on" : "off"}
          options={OPEN_MODE_OPTIONS}
          colorMap={OPEN_MODE_COLORS}
          action={setPermissionsOpenMode}
          ariaLabel="Permissions open mode"
        />
      </div>

      <div className={openMode ? "opacity-70" : ""}>
        <PermissionMatrixTable matrix={matrix} />
      </div>
    </div>
  );
}
