import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { loadServiceCollection } from "../src/app/service/collectionData";

test("a small collection needs only one query for every display choice", async () => {
  let calls = 0;
  const tickets = [{ id: "ticket-1" }, { id: "ticket-2" }];
  const result = await loadServiceCollection(async () => { calls++; return tickets; }, {}, 120);
  assert.deepEqual(result, { rows: tickets, hasMore: false });
  assert.equal(calls, 1);
});

test("large collections retain every lane, deduplicate shared tickets, preserve filters, and apply database ordering", async () => {
  const filter: Prisma.ServiceIssueWhereInput = { assigneeId: "user-1" };
  const calls: { where: Prisma.ServiceIssueWhereInput; take?: number }[] = [];
  async function query(where: Prisma.ServiceIssueWhereInput, take?: number) {
    calls.push({ where, take });
    if (where === filter) return [{ id: "a" }, { id: "b" }, { id: "c" }];
    const clauses = where.AND as Prisma.ServiceIssueWhereInput[];
    assert.deepEqual(clauses[0], filter);
    const lane = clauses[1];
    if (lane.id) {
      const ids = (lane.id as { in: string[] }).in;
      assert.equal(ids.length, new Set(ids).size);
      assert.equal(take, ids.length);
      return ids.sort().map(id => ({ id }));
    }
    const key = String(lane.status ?? lane.priority);
    return [{ id: "shared" }, { id: key }, { id: `${key}-extra` }];
  }
  const result = await loadServiceCollection(query, filter, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.rows.length, 9);
  assert.equal(result.rows.filter(row => row.id === "shared").length, 1);
  for (const lane of ["open", "in_progress", "resolved", "closed", "critical", "high", "medium", "low"]) {
    assert.ok(result.rows.some(row => row.id === lane));
    assert.ok(!result.rows.some(row => row.id === `${lane}-extra`));
  }
  assert.deepEqual(result.rows.map(row => row.id), result.rows.map(row => row.id).sort());
  assert.equal(calls.length, 10);
});

test("combining complete lane windows clears the load-more flag", async () => {
  let calls = 0;
  const result = await loadServiceCollection(async where => {
    calls++;
    if (!where.AND) return [{ id: "a" }, { id: "b" }, { id: "c" }];
    return [{ id: "a" }];
  }, {}, 2);
  assert.equal(calls, 10);
  assert.equal(result.hasMore, false);
});

test("large collections use lightweight lane reads and hydrate the combined result once", async () => {
  let fullReads = 0;
  let laneReads = 0;
  const result = await loadServiceCollection(async where => {
    fullReads++;
    if (!where.AND) return [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    return [{ id: "a", title: "A" }];
  }, {}, 1, async where => {
    laneReads++;
    if (!where.AND) return [{ id: "a" }, { id: "b" }];
    return [{ id: "a" }];
  });
  assert.equal(fullReads, 1);
  assert.equal(laneReads, 9);
  assert.deepEqual(result, { rows: [{ id: "a", title: "A" }], hasMore: false });
});
