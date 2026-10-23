import { getActiveUsers } from "@/lib/users";
import { can } from "@/lib/permissionsServer";
import { notFound } from "next/navigation";
import { BadgeSelect } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
import { REQUIRABLE_FIELDS, getFieldRequirements } from "@/lib/fieldRequirements";
import { getSettings } from "@/lib/settings";
import { FLOW_STEPS } from "@/lib/ballInCourt";
import { getStageHolders } from "@/lib/courtHolders";
import { setFieldRequired, setServiceDefaultAssignee } from "./actions";
import { CourtHolderRow } from "./CourtHolderRow";

export const dynamic = "force-dynamic";

const REQUIRED_STATES = [
  { value: "required", label: "Required" },
  { value: "optional", label: "Optional" },
] as const;
const REQUIRED_COLORS: Record<string, string> = { required: "badge-blue", optional: "badge-gray" };

const ENTITY_LABELS: Record<string, string> = {
  company: "Business form",
  opportunity: "Deal form",
};

export default async function AdminSettingsPage() {
  if (!(await can("admin.manage"))) notFound();
  const [requirements, settings, users, stageHolders] = await Promise.all([
    getFieldRequirements(),
    getSettings(["service.defaultAssigneeId", "pricing.defaultAssigneeId"]),
    getActiveUsers(),
    getStageHolders(),
  ]);
  const byEntity = new Map<string, typeof REQUIRABLE_FIELDS[number][]>();
  for (const f of REQUIRABLE_FIELDS) {
    byEntity.set(f.entity, [...(byEntity.get(f.entity) ?? []), f]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="section-label">Ball in court</h2>
        <p className="page-sub">
          One person owns each card. Stage changes automatically update their assignment and notify them.
          Anyone can submit an intake. Confirm Deal starts with its creator and follows the deal’s salesperson.
        </p>
      </div>
      <div className="card card-flush overflow-hidden">
        <ul className="divide-y divide-border">
          {FLOW_STEPS.map((s) => (
            s.key === "close" ? <li key={s.key} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13.5px] font-medium text-ink">{s.label}</span>
                <span className="text-[13px] text-gray-dark">Deal’s salesperson</span>
              </div>
              <p className="mt-2 text-xs text-gray-dark">Defaults to the intake creator. Reassign the salesperson on the deal to hand closing to someone else.</p>
            </li> :
            <CourtHolderRow
              key={s.key}
              step={s.key}
              stepLabel={s.label}
              userId={stageHolders[s.key].userId ?? ""}
              users={users}
            />
          ))}
        </ul>
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="section-label">Customer service default assignee</h2>
          <p className="page-sub">
            Who a new service issue is assigned to when nobody picks someone (see /service).
          </p>
        </div>
        <UserSelect
          value={settings["service.defaultAssigneeId"] ?? ""}
          users={users}
          action={setServiceDefaultAssignee}
        />
      </div>

      <div>
        <h2 className="section-label">Required fields</h2>
        <p className="page-sub">
          Turn a field off here and it becomes optional on its form immediately - no code change
          needed.
        </p>
      </div>

      {[...byEntity.entries()].map(([entity, fields]) => (
        <div key={entity} className="card card-flush overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">{ENTITY_LABELS[entity] ?? entity}</h3>
          </div>
          <ul className="divide-y divide-border">
            {fields.map((f) => {
              const key = `${f.entity}.${f.field}`;
              const value = requirements[key] ? "required" : "optional";
              return (
                <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-[13.5px] text-ink">{f.label}</span>
                  <BadgeSelect
                    value={value}
                    options={REQUIRED_STATES}
                    colorMap={REQUIRED_COLORS}
                    action={setFieldRequired.bind(null, f.entity, f.field)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
