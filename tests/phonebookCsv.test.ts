import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, writeCsv, validatePhonebookRow, PHONEBOOK_SAMPLE } from "../src/lib/phonebookCsv";

test("sample is a valid business and a linked person", () => {
  const rows = parseCsv(writeCsv(PHONEBOOK_SAMPLE));
  rows.forEach((row, index) => validatePhonebookRow(row, index + 2));
  assert.equal(rows[0].name, rows[1].companyName);
});

test("export/import preserves Unicode, commas, quotes, multiline notes and phone prefixes", () => {
  const row = { kind: "business", name: 'Café, "Kitchen"', notes: "First line\nSecond line", phone: "+5025550100", email: "office@example.com" };
  const result = parseCsv(writeCsv([row]))[0];
  for (const [key, value] of Object.entries(row)) assert.equal(result[key], value);
});

test("formula-like cells are protected on export and restored on import", () => {
  for (const value of ["=1+1", "+123", "-123", "@SUM(A1)", "'=literal", "'quoted"]) {
    const csv = writeCsv([{ kind: "business", name: value }]);
    assert.ok(csv.includes(`"'${value}"`));
    assert.equal(parseCsv(csv)[0].name, value);
  }
});

test("rejects malformed CSV and ambiguous headers instead of shifting data", () => {
  for (const csv of ['kind,name\nbusiness,"unclosed', 'kind,name\nbusiness,"name"oops', 'kind,kind\nbusiness,business', 'kind,unknown\nbusiness,a', 'kind,name\nbusiness,a,b', 'name\nBusiness', 'kind,name\n']) {
    assert.throws(() => parseCsv(csv));
  }
});

test("row validation gives a row number and rejects invalid kinds, enum values and missing links", () => {
  const invalidRows: Record<string, string>[] = [{ kind: "other" }, { kind: "business", name: "A", type: "bad" }, { kind: "person", firstName: "Alex" }, { kind: "person", firstName: "Alex", companyName: "A", status: "bad" }];
  for (const row of invalidRows) {
    assert.throws(() => validatePhonebookRow(row, 7), /Row 7:/);
  }
});

test("supports BOM, CRLF and blank lines; bounds uploads to 1000 records", () => {
  assert.equal(parseCsv('\uFEFFkind,name\r\nbusiness,A\r\n\r\n').length, 1);
  assert.throws(() => parseCsv('kind,name\n' + 'business,A\n'.repeat(1001)), /at most 1000/);
});
