import { BadgeSelect } from "@/lib/ui";
import { REQUIRABLE_FIELDS, getFieldRequirements } from "@/lib/fieldRequirements";
import { setFieldRequired } from "./actions";

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
  const requirements = await getFieldRequirements();
  const byEntity = new Map<string, typeof REQUIRABLE_FIELDS[number][]>();
  for (const f of REQUIRABLE_FIELDS) {
    byEntity.set(f.entity, [...(byEntity.get(f.entity) ?? []), f]);
  }

  return (
    <div className="space-y-8">
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
                    action={(next) => setFieldRequired(f.entity, f.field, next)}
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
