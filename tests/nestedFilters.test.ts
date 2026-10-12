import test from "node:test";
import assert from "node:assert/strict";
import {
  compileFilterTree,
  matchFilterTree,
  readFilterTree,
} from "../src/lib/nestedFilters";
import type { ListField } from "../src/lib/listQuery";
const fields: ListField[] = [
  { key: "name", label: "Name", type: "text" },
  {
    key: "stage",
    label: "Stage",
    type: "enum",
    options: [
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ],
  },
  { key: "date", label: "Date", type: "date" },
  {
    key: "owner",
    label: "Owner",
    type: "enum",
    options: [{ value: "__unassigned__", label: "Unassigned" }],
  },
];
const leaf = (field: string, value: string, operator = "is") => ({
  id: field,
  field,
  value,
  operator,
});
const group = (children: unknown[], logic = "AND") => ({
  id: "root",
  logic,
  children,
});
const compile = (tree: unknown) =>
  compileFilterTree(fields, JSON.stringify(tree), {
    name: "company.name",
    stage: "status",
    date: "dueAt",
    owner: "ownerId",
  });
test("nested AND/OR preserves repeated fields and relation paths", () => {
  assert.deepEqual(
    compile(
      group([
        leaf("name", "kitchen", "contains"),
        group([leaf("stage", "open"), leaf("stage", "done")], "OR"),
      ]),
    ),
    {
      AND: [
        { company: { name: { contains: "kitchen", mode: "insensitive" } } },
        { OR: [{ status: "open" }, { status: "done" }] },
      ],
    },
  );
});
test("negation and unassigned have ORM semantics", () => {
  assert.deepEqual(
    compile(
      group([
        leaf("name", "test", "not_contains"),
        leaf("owner", "__unassigned__"),
      ]),
    ),
    {
      AND: [
        {
          NOT: { company: { name: { contains: "test", mode: "insensitive" } } },
        },
        { ownerId: null },
      ],
    },
  );
});
test("date equality includes the full day; invalid dates and blank groups do not constrain", () => {
  assert.deepEqual(compile(group([leaf("date", "2026-10-08")])), {
    AND: [
      {
        dueAt: {
          gte: new Date("2026-10-08T00:00:00Z"),
          lt: new Date("2026-10-09T00:00:00Z"),
        },
      },
    ],
  });
  assert.equal(
    compile(group([leaf("date", "2026-02-30"), leaf("name", ""), group([])])),
    undefined,
  );
});
test("undeclared fields and invalid enum values never enter the query", () => {
  assert.equal(
    compile(group([leaf("password", "secret"), leaf("stage", "bogus")])),
    undefined,
  );
  assert.deepEqual(readFilterTree("not-json", fields).children, []);
  assert.deepEqual(readFilterTree("x".repeat(16001), fields).children, []);
});
test("merged directory matching agrees with nested AND/OR and independent negation", () => {
  const tree = JSON.stringify(
    group([
      group([leaf("stage", "open"), leaf("stage", "done")], "OR"),
      leaf("name", "test", "not_contains"),
    ]),
  );
  assert.equal(
    matchFilterTree(fields, tree, { stage: "open", name: "KITCHEN" }),
    true,
  );
  assert.equal(
    matchFilterTree(fields, tree, { stage: "open", name: "TEST kitchen" }),
    false,
  );
  assert.equal(
    matchFilterTree(fields, tree, { stage: "other", name: "Kitchen" }),
    false,
  );
});
