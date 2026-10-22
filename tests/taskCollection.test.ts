import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { loadTaskCollection } from "../src/app/tasks/collectionData";

test("Tasks loads a small shared table/board snapshot with one query", async () => {
  let calls = 0;
  const tasks = [{ id: "task-1" }];
  const result = await loadTaskCollection(async () => { calls++; return tasks; }, { parentTaskId: null }, 120);
  assert.equal(calls, 1);
  assert.deepEqual(result, { rows: tasks, hasMore: false });
});

test("task lane windows preserve parent, ownership, and nested filters before one hydration", async () => {
  const where: Prisma.TaskWhereInput = { parentTaskId: null, AND: [{ assigneeId: "user-1" }, { type: "external" }] };
  let fullReads = 0;
  const lanes: string[] = [];
  const result = await loadTaskCollection(async conditions => {
    fullReads++;
    if (conditions === where) return [{ id: "a" }, { id: "b" }];
    const clauses = conditions.AND as Prisma.TaskWhereInput[];
    assert.deepEqual(clauses[0], where);
    const ids = (clauses[1].id as { in: string[] }).in;
    return ids.map(id => ({ id }));
  }, where, 1, async conditions => {
    if (conditions === where) return [{ id: "initial-1" }, { id: "initial-2" }];
    const clauses = conditions.AND as Prisma.TaskWhereInput[];
    assert.deepEqual(clauses[0], where);
    const value = String(clauses[1].status ?? clauses[1].priority);
    lanes.push(value);
    return [{ id: value }, { id: `${value}-older` }];
  });
  assert.equal(fullReads, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.rows.length, 8);
  assert.deepEqual(new Set(lanes), new Set(["not_started", "in_progress", "done", "stuck", "low", "medium", "high", "critical"]));
});
