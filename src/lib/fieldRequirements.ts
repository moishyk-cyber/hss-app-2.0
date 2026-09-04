import { prisma } from "./prisma";

/**
 * Registry of fields the Settings tab can toggle required/optional on. The
 * FieldRequirement table only ever stores an override - a field with no row
 * yet falls back to `defaultRequired` here, so shipping a new entry never
 * needs a data migration.
 */
export const REQUIRABLE_FIELDS = [
  { entity: "company", field: "phone", label: "Business phone", defaultRequired: true },
  { entity: "company", field: "email", label: "Business email", defaultRequired: true },
  { entity: "opportunity", field: "companyId", label: "Deal company", defaultRequired: true },
  {
    entity: "opportunity",
    field: "neededByDate",
    label: "Deal needed-by date",
    defaultRequired: true,
  },
] as const;

export type RequirableEntity = (typeof REQUIRABLE_FIELDS)[number]["entity"];
export type RequirableField = (typeof REQUIRABLE_FIELDS)[number]["field"];

function key(entity: string, field: string): string {
  return `${entity}.${field}`;
}

/** entity.field -> required, for every registered field (defaults filled in). */
export async function getFieldRequirements(): Promise<Record<string, boolean>> {
  const rows = await prisma.fieldRequirement.findMany();
  const overrides = new Map(rows.map((r) => [key(r.entity, r.field), r.required]));
  return Object.fromEntries(
    REQUIRABLE_FIELDS.map((f) => [key(f.entity, f.field), overrides.get(key(f.entity, f.field)) ?? f.defaultRequired])
  );
}
