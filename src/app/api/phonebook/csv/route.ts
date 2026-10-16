import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUser, requirePermission } from "@/lib/permissionsServer";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { CSV_MAX_BYTES, parseCsv, PHONEBOOK_SAMPLE, validatePhonebookRow, writeCsv } from "@/lib/phonebookCsv";
import { hasSameOrigin } from "@/lib/requestOrigin";

export const dynamic = "force-dynamic";
const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
function download(rows: Record<string, unknown>[], filename: string) {
  return new Response(writeCsv(rows), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  } });
}

export async function GET(request: Request) {
  if (!await currentUser()) return Response.json({ message: "Sign in to download CSV files." }, { status: 401 });
  if (new URL(request.url).searchParams.get("sample") === "1") return download(PHONEBOOK_SAMPLE, "phonebook-sample.csv");
  const [businesses, people] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.contact.findMany({ include: { company: { select: { name: true } } }, orderBy: { firstName: "asc" } }),
  ]);
  return download([
    ...businesses.map(business => ({ ...business, kind: "business" })),
    ...people.map(person => ({ ...person, kind: "person", companyName: person.company?.name })),
  ], "phonebook.csv");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !hasSameOrigin(request)) return Response.json({ message: "Import from this app's Phone Book." }, { status: 403 });
  const denied = await requirePermission("phonebook.edit");
  if (denied && !denied.ok) return Response.json({ message: denied.message }, { status: 403 });
  if (Number(request.headers.get("content-length")) > CSV_MAX_BYTES) return Response.json({ message: "Choose a CSV smaller than 2 MB." }, { status: 413 });
  // Stream a bounded body rather than buffering an arbitrarily large upload.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ message: "Choose a CSV file." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CSV_MAX_BYTES) { await reader.cancel(); return Response.json({ message: "Choose a CSV smaller than 2 MB." }, { status: 413 }); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    rows.forEach((row, index) => validatePhonebookRow(row, index + 2));
    const [requirements, user] = await Promise.all([getFieldRequirements(), currentUser()]);
    const result = await prisma.$transaction(async tx => {
      const [businesses, people] = await Promise.all([tx.company.findMany(), tx.contact.findMany({ select: { id: true } })]);
      const businessById = new Map(businesses.map(business => [business.id, business]));
      const companyNames = new Map<string, string[]>();
      const addName = (name: string, id: string) => { const key = normalize(name); companyNames.set(key, [...(companyNames.get(key) ?? []), id]); };
      businesses.forEach(business => addName(business.name, business.id));
      const personIds = new Set(people.map(person => person.id));
      const seenIds = new Set<string>();
      let created = 0, updated = 0;
      // Plan every row before writing. A new business can be referenced anywhere in the file.
      const plan = rows.map((row, index) => {
        const fail = (message: string): never => { throw new Error(`Row ${index + 2}: ${message}`); };
        const id = row.id || crypto.randomUUID();
        if (seenIds.has(id)) fail("the same record ID appears twice.");
        seenIds.add(id);
        if (row.id && !(row.kind === "business" ? businessById.has(id) : personIds.has(id))) fail("record ID does not exist. Leave id empty to create a new record.");
        if (row.kind === "business") {
          const existing = businessById.get(id);
          for (const field of ["phone", "email"] as const) {
            if (requirements[`company.${field}`] && !(field in row ? row[field] : existing?.[field])) fail(`${field} is required for businesses.`);
          }
          const duplicates = companyNames.get(normalize(row.name))?.filter(other => other !== id);
          if (duplicates?.length) fail("a business with this name already exists. Use its exported id to update it.");
          if (existing) {
            const key = normalize(existing.name);
            companyNames.set(key, (companyNames.get(key) ?? []).filter(other => other !== id));
          }
          addName(row.name, id);
        }
        return { row, id, existing: !!row.id, fail };
      });
      const prepared = plan.map(item => {
        if (item.row.kind === "business") return { ...item, companyId: null };
        const { row, fail } = item;
        const matches = companyNames.get(normalize(row.companyName ?? "")) ?? [];
        const companyId = row.companyId || (matches.length === 1 ? matches[0] : "");
        if (!companyId || ![...companyNames.values()].some(ids => ids.includes(companyId))) fail("business was not found or its name is ambiguous. Use companyId from an export, or add a business row.");
        if (row.companyId && row.companyName && !matches.includes(row.companyId)) fail("companyId and companyName refer to different businesses.");
        return { ...item, companyId };
      });
      for (const { row, id, existing, companyId } of prepared.sort((a, b) => Number(a.row.kind === "person") - Number(b.row.kind === "person"))) {
        const optional = (keys: string[]) => Object.fromEntries(keys.filter(key => key in row).map(key => [key, row[key] || null]));
        if (row.kind === "business") {
          const data = {
            name: row.name,
            ...(row.type ? { type: row.type } : {}),
            ...optional(["vertical", "email", "phone", "phoneExt", "cellPhone", "website", "deliveryAddress", "billingAddress", "locationName", "zip", "notes"]),
          };
          if (existing) await tx.company.update({ where: { id }, data });
          else await tx.company.create({ data: { ...data, id } });
        } else {
          const data = {
            firstName: row.firstName, companyId,
            ...(row.status ? { status: row.status } : {}),
            ...optional(["lastName", "title", "email", "phone", "phoneExt", "cellPhone", "notes"]),
          };
          if (existing) await tx.contact.update({ where: { id }, data });
          else await tx.contact.create({ data: { ...data, id } });
        }
        await tx.activityLog.create({ data: { userId: user?.id, userName: user?.name, linkedType: row.kind === "business" ? "company" : "contact", linkedId: id, action: existing ? "csv_updated" : "csv_created", detail: "Imported from Phone Book CSV", sourceScreen: "/phonebook" } });
        if (existing) updated++; else created++;
      }
      return { created, updated };
    }, { isolationLevel: "Serializable", timeout: 30000 });
    revalidatePath("/", "layout");
    return Response.json({ message: `Imported successfully: ${result.created} created, ${result.updated} updated.`, ...result });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Row ") || /CSV|column|records|quoted/.test(error.message))) return Response.json({ message: `${error.message} No records were saved.` }, { status: 400 });
    console.error("Phone Book CSV import failed", error);
    return Response.json({ message: "Import could not be saved. No records were changed. Check the file and try again." }, { status: 400 });
  }
}
