import { BadgeSelect } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
import { REQUIRABLE_FIELDS, getFieldRequirements } from "@/lib/fieldRequirements";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
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
  const [requirements, settings, users, stageHolders] = await Promise.all([
    getFieldRequirements(),
    getSettings(["service.defaultAssigneeId"]),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
          Who the ball-in-court badge names at each stage of the flow. Pin one or more people,
          or leave a stage with nobody pinned to show the role instead.
        </p>
      </div>
      <div className="card card-flush overflow-hidden">
        <ul className="divide-y divide-border">
          {FLOW_STEPS.map((s) => (
            <CourtHolderRow
              key={s.key}
              step={s.key}
              stepLabel={s.label}
              role={stageHolders[s.key].role ?? "sales"}
              userIds={stageHolders[s.key].userIds}
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
