/**
 * HSS Kitchens — database seed.
 *
 * Migrates the client's real monday.com export (prisma/monday-export/*.json) into
 * the Prisma schema. Idempotent: every table is cleared (FK-safe order) before the
 * import runs, so `npx prisma db seed` can be re-run at will.
 *
 * Every imported row keeps its monday item id in `mondayId`, which is also how
 * board_relation columns are resolved back to previously-created rows.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPORT_DIR = join(__dirname, "monday-export");

// ---------------------------------------------------------------------------
// monday export shapes
// ---------------------------------------------------------------------------

type MondayColumnValue = { id: string; text: string | null; value: string | null };

type MondayItem = {
  id: string;
  name: string;
  group?: { title: string | null } | null;
  column_values: MondayColumnValue[];
  subitems?: MondayItem[] | null;
};

type MondayBoard = {
  id: string;
  name: string;
  items_page?: { items: MondayItem[] } | null;
  columns?: { id: string; title: string; type: string; settings_str?: string | null }[];
};

type MondayEnvelope = { data: { boards: MondayBoard[] } };

// Board ids (from prisma/monday-export/hss_schema_summary.txt)
const BOARD = {
  business: "18364381952",
  contacts: "18364381955",
  opportunities: "18364381920",
  salesLineItems: "18424782380",
  orders: "18424782388",
  orderLineItems: "18425103394",
  tasks: "18424782379",
  opportunitiesForm: "18424782390",
} as const;

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(EXPORT_DIR, file), "utf8")) as T;
}

const itemsExport = loadJson<MondayEnvelope>("hss_items.json");
const schemaExport = loadJson<MondayEnvelope>("hss_schema.json");

function itemsOf(boardId: string): MondayItem[] {
  const board = itemsExport.data.boards.find((b) => b.id === boardId);
  return board?.items_page?.items ?? [];
}

function schemaColumn(boardId: string, columnId: string) {
  const board = schemaExport.data.boards.find((b) => b.id === boardId);
  return board?.columns?.find((c) => c.id === columnId);
}

// ---------------------------------------------------------------------------
// column value helpers
// ---------------------------------------------------------------------------

function column(item: MondayItem, columnId: string): MondayColumnValue | undefined {
  return item.column_values.find((c) => c.id === columnId);
}

/** Trimmed display text of a column, or null when blank. */
function text(item: MondayItem, columnId: string): string | null {
  const raw = column(item, columnId)?.text;
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parsed JSON of a column's `value`, or null. */
function value<T = Record<string, unknown>>(item: MondayItem, columnId: string): T | null {
  const raw = column(item, columnId)?.value;
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** monday date columns render as "YYYY-MM-DD". */
function dateOf(item: MondayItem, columnId: string): Date | null {
  const raw = text(item, columnId);
  if (!raw) return null;
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function numberOf(item: MondayItem, columnId: string): number | null {
  const raw = text(item, columnId);
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function boolOf(item: MondayItem, columnId: string): boolean {
  const parsed = value<{ checked?: boolean | string }>(item, columnId);
  if (parsed && parsed.checked !== undefined) {
    return parsed.checked === true || parsed.checked === "true";
  }
  return text(item, columnId) === "v";
}

/** Yes/No status columns. */
function yesNo(item: MondayItem, columnId: string, fallback = false): boolean {
  const raw = text(item, columnId);
  if (!raw) return fallback;
  return raw.toLowerCase() === "yes";
}

/** board_relation columns store {"linkedPulseIds":[{"linkedPulseId":123}]}. */
function linkedIds(item: MondayItem, columnId: string): string[] {
  const parsed = value<{
    linkedPulseIds?: { linkedPulseId: number | string }[];
    linkedPulseId?: number | string;
  }>(item, columnId);
  if (!parsed) return [];
  if (Array.isArray(parsed.linkedPulseIds)) {
    return parsed.linkedPulseIds
      .map((l) => (l?.linkedPulseId != null ? String(l.linkedPulseId) : null))
      .filter((x): x is string => !!x);
  }
  if (parsed.linkedPulseId != null) return [String(parsed.linkedPulseId)];
  return [];
}

function firstLinkedId(item: MondayItem, columnId: string): string | null {
  return linkedIds(item, columnId)[0] ?? null;
}

/** True when any board_relation column on the item actually carries links. */
function hasAnyLinks(item: MondayItem): boolean {
  return item.column_values.some(
    (c) => c.id.startsWith("board_relation") && linkCountOfRaw(c.value) > 0
  );
}

function linkCountOfRaw(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { linkedPulseIds?: unknown[] };
    return Array.isArray(parsed.linkedPulseIds) ? parsed.linkedPulseIds.length : 0;
  } catch {
    return 0;
  }
}

/** People columns render as "First Last, Other Person". */
function personNames(item: MondayItem, columnId: string): string[] {
  const raw = text(item, columnId);
  if (!raw) return [];
  return raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function mapLabel<T extends string>(
  label: string | null,
  map: Record<string, T>,
  fallback: T
): T {
  if (!label) return fallback;
  return map[label] ?? map[label.trim()] ?? fallback;
}

/** "Critical ⚠️" -> "critical" */
function stripEmoji(input: string): string {
  return input
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Opportunity/Order titles come through as "Company Name - 2026-08-11". */
function stripTrailingDate(title: string): string {
  return title.replace(/\s*[-–]\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
}

// ---------------------------------------------------------------------------
// user directory
// ---------------------------------------------------------------------------

const SEED_USERS = [
  { name: "Moishy Klein", email: "moishyk@klyneandco.com", role: "admin" },
  { name: "Herman Freund", email: "herman@hsskitchens.com", role: "sales" },
  { name: "Sam Freund", email: "sam@hsskitchens.com", role: "purchasing" },
  { name: "Mrs. Perl", email: "accounting@hsskitchens.com", role: "billing" },
  { name: "Sean Henderson", email: "design@hsskitchens.com", role: "design" },
] as const;

const userIdByKey = new Map<string, string>();
const ambiguousUserKeys = new Set<string>();

function registerUserKey(key: string, userId: string) {
  const k = normalizeName(key);
  if (!k || ambiguousUserKeys.has(k)) return;
  const existing = userIdByKey.get(k);
  if (existing && existing !== userId) {
    // e.g. "freund" matches both Herman and Sam — stop using it.
    userIdByKey.delete(k);
    ambiguousUserKeys.add(k);
    return;
  }
  userIdByKey.set(k, userId);
}

function registerUser(name: string, userId: string) {
  const tokens = name.split(/\s+/).filter(Boolean);
  registerUserKey(name, userId);
  if (tokens[0]) registerUserKey(tokens[0], userId);
  if (tokens.length > 1) registerUserKey(tokens[tokens.length - 1], userId);
}

let createdUserCount = 0;

/** Match a monday person name to a user; create a sales user when unknown. */
async function resolveUserByName(rawName: string): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;
  const key = normalizeName(name);
  const direct = userIdByKey.get(key);
  if (direct) return direct;

  const firstToken = normalizeName(name.split(/\s+/)[0] ?? "");
  const byFirst = userIdByKey.get(firstToken);
  if (byFirst) return byFirst;

  const slug = key.replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || `user${createdUserCount}`;
  const created = await prisma.user.create({
    data: { name, email: `${slug}@imported.local`, role: "sales" },
  });
  createdUserCount += 1;
  registerUser(name, created.id);
  return created.id;
}

/** Resolve the first name in a people column that we can map to a user. */
async function resolvePersonColumn(item: MondayItem, columnId: string): Promise<string | null> {
  const names = personNames(item, columnId);
  for (const name of names) {
    const key = normalizeName(name);
    if (userIdByKey.has(key)) return userIdByKey.get(key)!;
    const first = normalizeName(name.split(/\s+/)[0] ?? "");
    if (userIdByKey.has(first)) return userIdByKey.get(first)!;
  }
  if (names.length > 0) return resolveUserByName(names[0]);
  return null;
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

async function clearAll() {
  // FK-safe order: children before parents.
  await prisma.activityLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.intakeSubmission.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.task.deleteMany();
  await prisma.order.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.supplierProfile.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUsers() {
  for (const u of SEED_USERS) {
    const created = await prisma.user.create({
      data: { name: u.name, email: u.email, role: u.role },
    });
    registerUser(u.name, created.id);
  }
}

// mondayId -> row id lookups, populated as boards are imported.
const companyIdByMondayId = new Map<string, string>();
const companyIdByName = new Map<string, string>();
const supplierIdByName = new Map<string, string>();
const contactIdByMondayId = new Map<string, string>();
const opportunityIdByMondayId = new Map<string, string>();
const opportunityIdByTitle = new Map<string, string>();
const orderIdByMondayId = new Map<string, string>();

function rememberCompanyName(name: string, id: string) {
  const key = normalizeName(name);
  if (!companyIdByName.has(key)) companyIdByName.set(key, id);
}

/**
 * Resolve a board_relation to a company; when the export carries no links
 * (which is the case for this dump) fall back to matching on the item title.
 */
function resolveCompany(item: MondayItem, relationColumnId: string): string | null {
  const linked = firstLinkedId(item, relationColumnId);
  if (linked && companyIdByMondayId.has(linked)) return companyIdByMondayId.get(linked)!;
  const byTitle = companyIdByName.get(normalizeName(stripTrailingDate(item.name)));
  return byTitle ?? null;
}

async function seedCompanies() {
  for (const item of itemsOf(BOARD.business)) {
    const created = await prisma.company.create({
      data: {
        name: item.name.trim() || "Untitled company",
        type: "customer",
        email: text(item, "email_mm5vmyda"),
        phone: text(item, "phone_mm5wxfh2"),
        cellPhone: text(item, "phone_mm5wykh1"),
        phoneExt: text(item, "numeric_mm5wyeg3"),
        deliveryAddress: text(item, "location_mm5vx4dg"),
        zip: text(item, "text_mm5v4m1"),
        billingAddress: text(item, "location_mm5v90kq"),
        locationName: text(item, "text_mm5vzmz7"),
        website: text(item, "company_profile"),
        mondayId: item.id,
      },
    });
    companyIdByMondayId.set(item.id, created.id);
    rememberCompanyName(created.name, created.id);
  }
}

async function seedSuppliers() {
  const col = schemaColumn(BOARD.salesLineItems, "dropdown_mm51nby3");
  if (!col?.settings_str) return;
  let labels: { id: number; name: string }[] = [];
  try {
    labels = (JSON.parse(col.settings_str) as { labels?: { id: number; name: string }[] }).labels ?? [];
  } catch {
    labels = [];
  }
  const seen = new Set<string>();
  for (const label of labels) {
    const name = (label?.name ?? "").trim();
    if (!name || seen.has(normalizeName(name))) continue;
    seen.add(normalizeName(name));
    const created = await prisma.company.create({
      data: { name, type: "supplier" },
    });
    supplierIdByName.set(normalizeName(name), created.id);
  }
}

const CONTACT_TITLES = ["manager", "purchasing", "billing"];

async function seedContacts() {
  for (const item of itemsOf(BOARD.contacts)) {
    const fullName = item.name.trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "Unnamed");

    const rawTitle = text(item, "title5");
    const normalizedTitle = rawTitle ? rawTitle.toLowerCase() : null;
    const title = normalizedTitle
      ? CONTACT_TITLES.includes(normalizedTitle)
        ? normalizedTitle
        : "other"
      : null;
    const notes: string[] = [];
    if (rawTitle && title === "other") notes.push(`monday title: ${rawTitle}`);
    const companyText = text(item, "text8");
    if (companyText) notes.push(`monday company: ${companyText}`);

    const linkedCompany = firstLinkedId(item, "contact_account");
    const companyId =
      (linkedCompany && companyIdByMondayId.get(linkedCompany)) ||
      (companyText ? companyIdByName.get(normalizeName(companyText)) : undefined) ||
      null;

    const created = await prisma.contact.create({
      data: {
        firstName,
        lastName,
        title,
        email: text(item, "contact_email"),
        phone: text(item, "contact_phone"),
        cellPhone: text(item, "phone_mm5vgzzw"),
        phoneExt: text(item, "numeric_mm5vv0f8"),
        companyId,
        notes: notes.length ? notes.join(" · ") : null,
        mondayId: item.id,
      },
    });
    contactIdByMondayId.set(item.id, created.id);
  }
}

const OPPORTUNITY_STAGE_BY_GROUP: Record<string, string> = {
  "New Opportunities": "new",
  "Information Missing": "info_missing",
  "Proposal Sent": "proposal_sent",
  "Revisions Needed": "revisions_needed",
  "Won Deals": "won",
  "Lost Deals": "lost",
};

async function seedOpportunities() {
  for (const item of itemsOf(BOARD.opportunities)) {
    const groupTitle = item.group?.title ?? null;
    const stage = mapLabel(groupTitle, OPPORTUNITY_STAGE_BY_GROUP, "new");

    const orderTypeLabel = text(item, "color_mm5w3j3f");
    const deliveryTypeLabel = text(item, "color_mm5v227q");

    const created = await prisma.opportunity.create({
      data: {
        title: item.name.trim() || "Untitled opportunity",
        stage,
        companyId: resolveCompany(item, "board_relation_mm5w17am"),
        primaryContactId:
          contactIdByMondayId.get(firstLinkedId(item, "deal_contact") ?? "") ?? null,
        salespersonId: await resolvePersonColumn(item, "deal_owner"),
        value: numberOf(item, "deal_value"),
        estDueDate: dateOf(item, "date_mm5vx8ns"),
        orderType: orderTypeLabel ? orderTypeLabel.toLowerCase() : "order",
        needsPricing: yesNo(item, "color_mm5wqb2n", true),
        lostReason: text(item, "text_mm5vf8wp"),
        facilityType: text(item, "text_mm5w2z8c"),
        menu: text(item, "text_mm5wms4m"),
        roomDimensions: text(item, "text_mm5vt48k"),
        wallMeasurements: text(item, "text_mm5vhde6"),
        deliveryType: deliveryTypeLabel ? deliveryTypeLabel.toLowerCase() : null,
        openingSize: text(item, "text_mm5v23a1"),
        installationNeeded: yesNo(item, "color_mm5vgm2t", false),
        locationName: text(item, "text_mm5v4c3e"),
        deliveryAddress: text(item, "location_mm5v33ya"),
        submittedVia: "manual",
        mondayId: item.id,
      },
    });
    opportunityIdByMondayId.set(item.id, created.id);
    const titleKey = normalizeName(created.title);
    if (!opportunityIdByTitle.has(titleKey)) opportunityIdByTitle.set(titleKey, created.id);
  }
}

const RFQ_STATUS_BY_LABEL: Record<string, string> = {
  "Needs Pricing": "needs_pricing",
  "Send to the Supplier": "rfq_sent",
  "Pricing Received": "quote_received",
  "Pricing in auto quote": "priced_in_autoquotes",
  "Removed From Order": "removed",
};

const DELIVERY_STATUS_BY_LABEL: Record<string, string> = {
  Pending: "pending",
  Ordered: "ordered",
  "In Transit to HSS": "in_transit_to_hss",
  "In Transit to Client": "in_transit_to_client",
  "Arrived - Complete": "arrived_complete",
};

async function seedSalesLineItems() {
  for (const item of itemsOf(BOARD.salesLineItems)) {
    const supplierLabel = text(item, "dropdown_mm51nby3");
    await prisma.lineItem.create({
      data: {
        name: item.name.trim() || "Untitled item",
        description: text(item, "product_and_service_description"),
        rfqStatus: mapLabel(text(item, "color_mm59x9fp"), RFQ_STATUS_BY_LABEL, "needs_pricing"),
        brand: text(item, "text_mm513f7n"),
        supplierId: supplierLabel ? (supplierIdByName.get(normalizeName(supplierLabel)) ?? null) : null,
        opportunityId:
          opportunityIdByMondayId.get(firstLinkedId(item, "board_relation_mm59nm91") ?? "") ?? null,
        deliveryStatus: mapLabel(text(item, "color_mm51az56"), DELIVERY_STATUS_BY_LABEL, "pending"),
        dateOrdered: dateOf(item, "date_mm515dn3"),
        dateArrivedHss: dateOf(item, "date_mm51f1dv"),
        dateArrivedClient: dateOf(item, "date_mm51jjvf"),
        assigneeId: await resolvePersonColumn(item, "multiple_person_mm52s5sq"),
        nextFollowUp: dateOf(item, "date_mm523e3y"),
        followedUp: boolOf(item, "boolean_mm52mc05"),
        notes: text(item, "text_mm51n771"),
        mondayId: item.id,
      },
    });
  }
}

const ORDER_STATUS_BY_LABEL: Record<string, string> = {
  "New Order": "new",
  "In Progress": "pos_in_progress",
  Stuck: "stuck",
  Delivered: "delivered",
};

async function seedOrders() {
  for (const item of itemsOf(BOARD.orders)) {
    const statusLabel = text(item, "color_mm525nmp");
    const status = mapLabel(statusLabel, ORDER_STATUS_BY_LABEL, "new");
    const orderTypeLabel = text(item, "color_mm5x50xn");

    const linkedOpportunity = firstLinkedId(item, "board_relation_mm5vez4r");
    const opportunityId =
      opportunityIdByMondayId.get(linkedOpportunity ?? "") ??
      opportunityIdByTitle.get(normalizeName(item.name)) ??
      null;

    const created = await prisma.order.create({
      data: {
        title: item.name.trim() || "Untitled order",
        status,
        orderType: orderTypeLabel ? orderTypeLabel.toLowerCase() : "order",
        clientPoNumber: text(item, "text_mm63d1eq"),
        jobId: text(item, "text_mm52xrrc"),
        ownerId: await resolvePersonColumn(item, "multiple_person_mm52wahm"),
        companyId: resolveCompany(item, "board_relation_mm5xs2e0"),
        contactId: contactIdByMondayId.get(firstLinkedId(item, "board_relation_mm5xmc3") ?? "") ?? null,
        opportunityId,
        nextFollowUp: dateOf(item, "date_mm524b78"),
        notes: statusLabel ? `monday status: ${statusLabel}` : null,
        mondayId: item.id,
      },
    });
    orderIdByMondayId.set(item.id, created.id);
  }
}

const ORDER_ITEM_DELIVERY_BY_LABEL: Record<string, string> = {
  Payment: "pending",
  Traking: "in_transit_to_hss",
  Delivered: "arrived_complete",
};

async function seedOrderLineItems() {
  for (const item of itemsOf(BOARD.orderLineItems)) {
    await prisma.lineItem.create({
      data: {
        name: item.name.trim() || "Untitled item",
        description: text(item, "text_mm5x8937"),
        orderId: orderIdByMondayId.get(firstLinkedId(item, "board_relation_mm5xp8h2") ?? "") ?? null,
        rfqStatus: "approved",
        deliveryStatus: mapLabel(text(item, "status"), ORDER_ITEM_DELIVERY_BY_LABEL, "pending"),
        trackingUrl: text(item, "link_mm63eqa3"),
        assigneeId: await resolvePersonColumn(item, "person"),
        nextFollowUp: dateOf(item, "date_mm5x4hnh"),
        mondayId: item.id,
      },
    });
  }
}

const TASK_STATUS_BY_LABEL: Record<string, string> = {
  "Not Started": "not_started",
  "In Progress": "in_progress",
  Done: "done",
  Stuck: "stuck",
};

const TASK_STATUS_BY_GROUP: Record<string, string> = {
  "To Do": "not_started",
  "In Progress": "in_progress",
  Done: "done",
};

const TASK_TYPE_BY_LABEL: Record<string, string> = {
  Internal: "internal",
  "Customer Service": "customer_service",
  External: "external",
};

async function seedTasks() {
  for (const item of itemsOf(BOARD.tasks)) {
    const groupTitle = item.group?.title ?? null;
    const columnStatus = text(item, "color_mm51rd60");
    let status = columnStatus
      ? mapLabel(columnStatus, TASK_STATUS_BY_LABEL, "not_started")
      : mapLabel(groupTitle, TASK_STATUS_BY_GROUP, "not_started");
    // The group is the operator's real view of progress — let it upgrade a stale column.
    if (groupTitle === "Done") status = "done";

    const priorityLabel = text(item, "color_mm51eh49");
    const priority = priorityLabel ? stripEmoji(priorityLabel).toLowerCase() : "medium";

    const notes: string[] = [];
    const noteText = text(item, "text_mm51jhk3");
    if (noteText) notes.push(noteText);
    // Board relations on this board are mislabeled in monday — record, don't import.
    if (hasAnyLinks(item)) notes.push("monday links present");

    await prisma.task.create({
      data: {
        title: item.name.trim() || "Untitled task",
        status,
        priority: priority || "medium",
        type: mapLabel(text(item, "color_mm567mnc"), TASK_TYPE_BY_LABEL, "internal"),
        assigneeId: await resolvePersonColumn(item, "multiple_person_mm51mmr7"),
        dueDate: dateOf(item, "date_mm514hxw"),
        estimatedHours: numberOf(item, "numeric_mm5134j4"),
        notes: notes.length ? notes.join(" · ") : null,
        mondayId: item.id,
      },
    });
  }
}

async function seedIntakeSubmissions() {
  for (const item of itemsOf(BOARD.opportunitiesForm)) {
    await prisma.intakeSubmission.create({
      data: {
        payload: JSON.stringify(item),
        processed: text(item, "color_mm5xgdmx") === "Processed",
        mondayId: item.id,
      },
    });
  }
}

async function printCounts() {
  const counts = {
    User: await prisma.user.count(),
    Company: await prisma.company.count(),
    SupplierProfile: await prisma.supplierProfile.count(),
    Contact: await prisma.contact.count(),
    Opportunity: await prisma.opportunity.count(),
    LineItem: await prisma.lineItem.count(),
    Order: await prisma.order.count(),
    PurchaseOrder: await prisma.purchaseOrder.count(),
    Payment: await prisma.payment.count(),
    Task: await prisma.task.count(),
    IntakeSubmission: await prisma.intakeSubmission.count(),
    Document: await prisma.document.count(),
    ActivityLog: await prisma.activityLog.count(),
  };
  console.log("\nSeed complete — row counts:");
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(18)} ${n}`);
  }
}

async function main() {
  console.log("Clearing existing rows...");
  await clearAll();

  console.log("Seeding users...");
  await seedUsers();

  console.log("Importing Business board -> Company (customer)...");
  await seedCompanies();

  console.log("Importing Supplier dropdown labels -> Company (supplier)...");
  await seedSuppliers();

  console.log("Importing Contacts board -> Contact...");
  await seedContacts();

  console.log("Importing Sales - Opportunities -> Opportunity...");
  await seedOpportunities();

  console.log("Importing Sales - Line Items -> LineItem...");
  await seedSalesLineItems();

  console.log("Importing Orders -> Order...");
  await seedOrders();

  console.log("Importing Orders - Line Items -> LineItem...");
  await seedOrderLineItems();

  console.log("Importing Tasks -> Task...");
  await seedTasks();

  console.log("Importing Sales - Opportunities Form -> IntakeSubmission...");
  await seedIntakeSubmissions();

  await printCounts();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
