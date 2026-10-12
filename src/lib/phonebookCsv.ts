import { COMPANY_TYPES, COMPANY_VERTICALS } from "./constants";

export const PHONEBOOK_CSV_HEADERS = ["kind", "id", "name", "firstName", "lastName", "companyId", "companyName", "type", "vertical", "title", "status", "email", "phone", "phoneExt", "cellPhone", "website", "deliveryAddress", "billingAddress", "locationName", "zip", "notes"] as const;
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 1000;
export type CsvRow = Record<string, string>;

/** RFC 4180 quoting, including multiline cells; reject ambiguous malformed files. */
export function parseCsv(source: string): CsvRow[] {
  const text = source.replace(/^\uFEFF/, "");
  const table: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ""; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(value => value.trim())) table.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("Invalid CSV quotation. Use the sample CSV format.");
      quoted = true;
    } else if (char === ",") finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV cell.");
      cell += char;
    }
  }
  if (quoted) throw new Error("A quoted CSV cell is missing its closing quote.");
  finishRow();
  const headers = table.shift()?.map(value => value.trim()) ?? [];
  if (!headers.includes("kind")) throw new Error('The CSV needs a "kind" column (business or person). Download the sample CSV.');
  if (new Set(headers).size !== headers.length) throw new Error("The CSV has duplicate column names.");
  const unknown = headers.filter(header => !(PHONEBOOK_CSV_HEADERS as readonly string[]).includes(header));
  if (unknown.length) throw new Error(`Unknown columns: ${unknown.join(", ")}. Use the sample CSV headers.`);
  if (!table.length) throw new Error("The CSV contains no records.");
  if (table.length > CSV_MAX_ROWS) throw new Error(`Import at most ${CSV_MAX_ROWS} records at a time.`);
  return table.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Row ${index + 2}: expected ${headers.length} columns, found ${values.length}.`);
    return Object.fromEntries(headers.map((header, i) => [header, restoreCsvCell(values[i]).trim()]));
  });
}

// Reverse the protective prefix emitted by this app's exports.
function restoreCsvCell(value: string): string {
  return /^'(?:'|[\s]*[=+@-])/.test(value) ? value.slice(1) : value;
}

export function writeCsv(rows: Record<string, unknown>[]): string {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    // Prevent spreadsheet formula execution when a downloaded CSV is opened.
    if (/^(?:'|[\s]*[=+@-])/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [PHONEBOOK_CSV_HEADERS.join(","), ...rows.map(row => PHONEBOOK_CSV_HEADERS.map(header => cell(row[header])).join(","))].join("\r\n") + "\r\n";
}

export const PHONEBOOK_SAMPLE = [
  { kind: "business", name: "Sample Kitchen", type: "customer", email: "office@example.com", phone: "5550100", notes: "Example business — replace with your own data" },
  { kind: "person", firstName: "Alex", lastName: "Sample", companyName: "Sample Kitchen", title: "Manager", status: "active", email: "alex@example.com", phone: "5550101" },
];

export function validatePhonebookRow(row: CsvRow, rowNumber: number) {
  const fail = (message: string) => { throw new Error(`Row ${rowNumber}: ${message}`); };
  if (!["business", "person"].includes(row.kind)) fail('kind must be "business" or "person".');
  for (const [field, value] of Object.entries(row)) {
    const max = field === "notes" ? 4000 : ["deliveryAddress", "billingAddress"].includes(field) ? 1000 : 200;
    if (value.length > max) fail(`${field} exceeds ${max} characters.`);
  }
  if (row.kind === "business") {
    if (!row.name) fail("name is required for a business.");
    if (row.type && !COMPANY_TYPES.some(type => type.value === row.type)) fail("type is not a valid business type.");
    if (row.vertical && !COMPANY_VERTICALS.some(type => type.value === row.vertical)) fail("vertical is not valid.");
  } else {
    if (!row.firstName) fail("firstName is required for a person.");
    if (row.status && !["active", "onboarding", "inactive"].includes(row.status)) fail("status must be active, onboarding, or inactive.");
    if (!row.companyId && !row.companyName) fail("companyId or companyName is required for a person.");
  }
}
