import { requireTestDatabase } from "../src/lib/environmentMode";
/** Opt-in integration load test. Never sends email and never deletes fixtures automatically. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createSessionToken } from "../src/lib/session";
import { saveNotificationRows } from "../src/lib/notificationEmailQueue";
import { dispatchNotificationEmails } from "../src/lib/notificationEmails";
import { ResendDeliveryError, type EmailPayload } from "../src/lib/resendEmail";

const mode = process.argv[2];
const manifestPath = path.resolve("qa-reports/notification-stress-manifest.json");
const publicDb = new PrismaClient({ datasourceUrl: requireTestDatabase() });
const config = { apiKey: "test-placeholder-no-network", from: "HSS QA <qa@example.invalid>", appUrl: "https://hss-app-kappa.vercel.app" };
type Manifest = { run: string; schema: string; userId: string; inboxCount: number; queueCount: number; startedAt: string };
async function manifest(): Promise<Manifest> { return JSON.parse(await fs.readFile(manifestPath, "utf8")); }
function testDb(m: Manifest) {
  assert.match(m.schema, /^hss_qa_[a-z0-9_]+$/);
  const url = new URL(requireTestDatabase());
  url.searchParams.set("schema", m.schema);
  url.searchParams.set("connection_limit", "5");
  return new PrismaClient({ datasourceUrl: url.toString() });
}
async function report(name: string, value: unknown) {
  await fs.writeFile(path.resolve(`qa-reports/${name}.json`), JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value));
}

async function setup() {
  try { await fs.access(manifestPath); throw new Error("Fixtures already exist. Reuse them; do not overwrite their cleanup manifest."); }
  catch (e) { if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e; }
  const user = await publicDb.user.findFirst({ where: { name: { contains: "Joseph Castillo", mode: "insensitive" }, active: true }, select: { id: true } });
  assert.ok(user, "Review account not found");
  const run = `hss_qa_${Date.now().toString(36)}`;
  const m: Manifest = { run, schema: run, userId: user.id, inboxCount: 1000, queueCount: 1000, startedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  // Persist before any writes so interrupted setup still has an exact cleanup scope.
  await fs.writeFile(manifestPath, JSON.stringify(m, null, 2));
  await publicDb.$executeRawUnsafe(`CREATE SCHEMA "${m.schema}"`);
  for (const table of ["User", "AppSetting", "Notification", "NotificationEmail"]) {
    await publicDb.$executeRawUnsafe(`CREATE TABLE "${m.schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  // LIKE copies columns/indexes; add the same referential constraints used in production.
  await publicDb.$executeRawUnsafe(`ALTER TABLE "${m.schema}"."Notification" ADD FOREIGN KEY ("userId") REFERENCES "${m.schema}"."User"("id") ON DELETE CASCADE`);
  await publicDb.$executeRawUnsafe(`ALTER TABLE "${m.schema}"."NotificationEmail" ADD FOREIGN KEY ("notificationId") REFERENCES "${m.schema}"."Notification"("id") ON DELETE CASCADE`);
  const db = testDb(m);
  try {
    await db.user.create({ data: { id: "qa-worker", name: "QA isolated worker", email: "worker@example.invalid", role: "viewer" } });
    await db.appSetting.create({ data: { key: "notifications.emailStartedAt", value: "2020-01-01T00:00:00Z" } });
    const started = performance.now();
    for (let offset = 0; offset < m.queueCount; offset += 100) {
      const data = Array.from({ length: Math.min(100, m.queueCount - offset) }, (_, i) => ({
        id: `queue-${offset+i}`, userId: "qa-worker", eventKey: `queue-${offset+i}`, kind: "qa_stress",
        title: `[LOAD TEST] Queue ${offset+i+1}`, message: "Isolated database queue; no real email transport.", href: "/notifications",
      }));
      await db.$transaction(tx => saveNotificationRows(tx, data), { timeout: 30000 });
      await db.$transaction(tx => saveNotificationRows(tx, data), { timeout: 30000 });
    }
    assert.equal(await db.notification.count(), m.queueCount);
    assert.equal(await db.notificationEmail.count(), m.queueCount);
    // Live inbox samples deliberately bypass email enqueue. They contain no customer data.
    await publicDb.notification.createMany({ data: Array.from({ length: m.inboxCount }, (_, i) => ({
      userId: m.userId, eventKey: `${run}:${i}`, kind: "qa_stress", title: `[LOAD TEST] ${String(i+1).padStart(4,"0")} — ${["Verify quotes", "Pricing ready", "Ball in court", "Deposit reminder", "Task due"][i%5]}`,
      message: `Synthetic notification ${i+1} of ${m.inboxCount}. Run ${run}. Kept for your review; no email was sent.`, href: "/notifications", readAt: i%4 === 0 ? new Date() : null,
    })) });
    await report("notification-stress-setup", { ...m, enqueueAndDuplicateCheckMs: Math.round(performance.now()-started), queuedExactlyOnce: true, bulkEmailsSent: 0, autoCleanup: false });
  } finally { await db.$disconnect(); }
}

async function queue() {
  const m = await manifest(); const db = testDb(m);
  const calls = new Map<string, number>(); const delivered = new Map<string,string>(); const payloads = new Map<string,string>();
  let virtualNow = new Date(); let duplicateProviderRequests = 0;
  const started = performance.now();
  const send = async (_config: typeof config, payload: EmailPayload, key: string) => {
    const frozen = JSON.stringify(payload);
    if (payloads.has(key)) assert.equal(payloads.get(key), frozen, "Retry changed payload"); else payloads.set(key, frozen);
    const attempt = (calls.get(key) ?? 0)+1; calls.set(key, attempt);
    const index = Number(key.split("queue-")[1]);
    if (index%97 === 0) throw new ResendDeliveryError(false, "simulated_invalid_recipient");
    if (attempt === 1 && index%13 === 0) throw new ResendDeliveryError(true, "simulated_429", 1000);
    if (attempt === 1 && index%17 === 0) throw new ResendDeliveryError(true, "simulated_503");
    if (delivered.has(key)) duplicateProviderRequests++;
    const id = delivered.get(key) ?? `simulated-${index}`; delivered.set(key, id);
    // Accepted-by-provider/response-lost scenario: retry must use the same key and payload.
    if (attempt === 1 && index%29 === 0) throw new ResendDeliveryError(true, "simulated_connection_uncertain");
    return id;
  };
  const workerErrors: string[] = [];
  try {
    for (let wave = 0; wave < 100; wave++) {
      const stats = await Promise.allSettled(Array.from({ length: 8 }, () => dispatchNotificationEmails(db, { config, limit: 25, maxMs: 45000, now: () => virtualNow, send, pause: async () => {} })));
      for (const s of stats) if (s.status === "rejected") workerErrors.push(s.reason instanceof Error ? s.reason.message.slice(0,150) : "worker failed");
      const pending = await db.notificationEmail.count({ where: { status: { in: ["pending", "sending"] } } });
      console.log(JSON.stringify({ wave, pending, elapsedSeconds: Math.round((performance.now()-started)/1000) }));
      if (!pending) break;
      virtualNow = new Date(virtualNow.getTime()+3*60000);
    }
    const groups = await db.notificationEmail.groupBy({ by: ["status"], _count: true });
    const sent = await db.notificationEmail.count({ where: { status: "sent" } });
    const failed = await db.notificationEmail.count({ where: { status: "failed" } });
    const pending = await db.notificationEmail.count({ where: { status: { in: ["pending", "sending"] } } });
    const outcome = { jobs: m.queueCount, workers: 8, wallMs: Math.round(performance.now()-started), groups, uniqueProviderDeliveries: delivered.size, duplicateProviderRequestsDeduplicated: duplicateProviderRequests, workerErrors, pending, bulkEmailsSent: 0, transport: "simulated; real PostgreSQL + application dispatcher", pass: sent+failed === m.queueCount && pending === 0 && delivered.size === sent && workerErrors.length === 0 };
    await report("notification-stress-queue", outcome);
    assert.equal(outcome.pass, true, "Queue stress test failed; review report");
  } finally { await db.$disconnect(); }
}

async function http() {
  const m = await manifest();
  const token = await createSessionToken(m.userId);
  const origin = "http://127.0.0.1:3001";
  const results: unknown[] = [];
  async function run(label: string, routes: string[], count: number, concurrency: number) {
    let cursor=0; const samples: number[]=[]; const failures: {route:string; status:number|string}[]=[];
    const began=performance.now();
    await Promise.all(Array.from({length:concurrency},async()=>{
      while(cursor<count) {
        const route=routes[cursor++%routes.length]; const at=performance.now();
        try {
          const response=await fetch(origin+route,{headers:{cookie:`hss_session=${token}`},redirect:"manual",signal:AbortSignal.timeout(60000)});
          const body=await response.text(); samples.push(performance.now()-at);
          if(response.status!==200 || body.includes('Something went wrong') || body.includes('That record isn’t here')) failures.push({route,status:response.status});
          if(route==="/api/notifications" && response.ok) { const feed=JSON.parse(body); assert.ok(feed.unread>=750); assert.equal(feed.latest.length,5); }
        } catch {failures.push({route,status:"timeout_or_invalid_response"});}
      }
    }));
    samples.sort((a,b)=>a-b); const q=(percent:number)=>Math.round(samples[Math.min(samples.length-1,Math.floor(samples.length*percent))]??0);
    const result={label,requests:count,concurrency,wallMs:Math.round(performance.now()-began),p50Ms:q(.5),p95Ms:q(.95),maxMs:q(1),failures}; results.push(result); console.log(JSON.stringify(result));
  }
  // Warm routes separately: reported samples then include DB/auth/rendering, not compilation.
  await run("warmup",["/api/notifications","/notifications","/dashboard","/orders","/pipeline","/deliveries"],6,1);
  await run("notification feed burst",["/api/notifications"],200,50);
  await run("inbox search and pagination",["/notifications","/notifications?scope=unread","/notifications?q=LOAD%20TEST","/notifications?records=240","/notifications?q=nonexistent-qa-result"],40,10);
  await run("mixed main pages",["/dashboard","/orders","/pipeline","/deliveries","/notifications"],25,5);
  await report("notification-stress-http",{run:m.run,baseUrl:origin,results,includesDatabaseNetworkLatency:true});
}

async function main() { try {
  if (mode === "setup") await setup();
  else if (mode === "queue") await queue();
  else if (mode === "http") await http();
  else throw new Error("Use setup, queue or http. No cleanup is automatic.");
} finally { await publicDb.$disconnect(); } }
main().catch(error => { console.error(error); process.exitCode = 1; });
