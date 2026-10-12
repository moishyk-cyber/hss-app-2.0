// Read-only before/after checks against the connected database. Prints timings only.
// Run: node --env-file=.env --import tsx scripts/benchmark-relations.ts
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { PIPELINE_CARD_SELECT, PIPELINE_DETAIL_INCLUDE } from "../src/app/pipeline/data";
import { ORDER_BALL_INCLUDE } from "../src/lib/flow";

const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let reads = 0;
prisma.$on("query", event => {
  if (/^SELECT\b/i.test(event.query.trim())) reads++;
});

// Relations without an explicit orderBy may return in a different physical order
// under a join. Compare their contents; ordered Pipeline cards are checked below.
function contents(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(contents).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, contents(inner)]));
  }
  return value;
}

async function run() {
  const sample = await prisma.opportunity.findFirst({
    where: { stage: { notIn: ["won", "lost"] } }, select: { id: true },
  });
  if (!sample) throw new Error("No open Pipeline record available to benchmark");
  const checks = [
    {
      surface: "Pipeline page query",
      run: (mode: "query" | "join") => prisma.opportunity.findMany({
        relationLoadStrategy: mode, take: 121,
        where: { stage: { notIn: ["won", "lost"] } },
        orderBy: { createdAt: "desc" }, select: PIPELINE_CARD_SELECT,
      }),
    },
    {
      surface: "Pipeline record query",
      run: (mode: "query" | "join") => prisma.opportunity.findUnique({
        relationLoadStrategy: mode, where: { id: sample.id }, include: PIPELINE_DETAIL_INCLUDE,
      }),
    },
    {
      surface: "Orders with workflow relations",
      run: (mode: "query" | "join") => prisma.order.findMany({
        relationLoadStrategy: mode, take: 121, orderBy: { createdAt: "desc" }, include: ORDER_BALL_INCLUDE,
      }),
    },
    {
      surface: "Tasks with subtasks",
      run: (mode: "query" | "join") => prisma.task.findMany({
        relationLoadStrategy: mode, take: 121, where: { parentTaskId: null }, orderBy: { createdAt: "asc" },
        include: { assignee: { select: { id: true, name: true } }, _count: { select: { comments: true } },
          subtasks: { include: { assignee: { select: { id: true, name: true } }, _count: { select: { comments: true } } }, orderBy: { createdAt: "asc" } } },
      }),
    },
    {
      surface: "Service with linked records",
      run: (mode: "query" | "join") => prisma.serviceIssue.findMany({
        relationLoadStrategy: mode, take: 121, orderBy: { reportedAt: "desc" },
        include: { company: { select: { id: true, name: true } }, location: { select: { id: true, name: true } },
          order: { select: { id: true, title: true } }, lineItem: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      }),
    },
  ];
  for (const check of checks) {
    const timings = { query: [] as number[], join: [] as number[] };
    for (let trial = 1; trial <= 3; trial++) {
      let baseline: unknown;
      for (const mode of ["query", "join"] as const) {
        reads = 0;
        const start = performance.now();
        const result: unknown = await check.run(mode);
        const elapsedMs = Math.round(performance.now() - start);
        timings[mode].push(elapsedMs);
        if (mode === "query") baseline = result;
        else {
          assert.deepEqual(contents(result), contents(baseline), `${check.surface}: relation contents differ`);
          if (check.surface.startsWith("Pipeline")) assert.deepEqual(result, baseline, "Pipeline ordering changed");
        }
        console.log(JSON.stringify({ surface: check.surface, trial, mode, databaseReads: reads, elapsedMs }));
      }
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    console.log(JSON.stringify({ surface: check.surface, beforeMedianMs: median(timings.query), afterMedianMs: median(timings.join), resultsMatch: true }));
  }
}
run().catch(error => {
  // Print a short diagnostic, never potentially sensitive record values from assertions.
  console.error(error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Database benchmark failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
