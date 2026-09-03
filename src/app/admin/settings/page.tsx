import { BadgeSelect } from "@/lib/ui";
import { UserSelect } from "@/lib/UserSelect";
import { REQUIRABLE_FIELDS, getFieldRequirements } from "@/lib/fieldRequirements";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { setFieldRequired, setServiceDefaultAssignee } from "./actions";
import { CompanySettingsForm } from "./CompanySettingsForm";

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
  const [requirements, companySettings, users] = await Promise.all([
    getFieldRequirements(),
    getSettings(["company.name", "company.address", "company.phone", "company.email", "po.pdfFooter", "service.defaultAssigneeId"]),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const byEntity = new Map<string, typeof REQUIRABLE_FIELDS[number][]>();
  for (const f of REQUIRABLE_FIELDS) {
    byEntity.set(f.entity, [...(byEntity.get(f.entity) ?? []), f]);
  }

  return (
    <div className="space-y-8">
      <div className="card space-y-4">
        <div>
          <h2 className="section-label">Company details (PO PDF)</h2>
          <p className="page-sub">
            Shown on every purchase-order PDF. Falls back to &ldquo;HSS Kitchen Equipment
            Inc&rdquo; / &ldquo;Brooklyn, NY&rdquo; until this is filled in.
          </p>
        </div>
        <CompanySettingsForm
          name={companySettings["company.name"] ?? ""}
          address={companySettings["company.address"] ?? ""}
          phone={companySettings["company.phone"] ?? ""}
          email={companySettings["company.email"] ?? ""}
          footer={companySettings["po.pdfFooter"] ?? ""}
        />
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="section-label">Customer service default assignee</h2>
          <p className="page-sub">
            Who a new service issue is assigned to when nobody picks someone (see /service).
          </p>
        </div>
        <UserSelect
          value={companySettings["service.defaultAssigneeId"] ?? ""}
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
