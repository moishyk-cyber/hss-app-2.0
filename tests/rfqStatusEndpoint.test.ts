import test from "node:test";
import assert from "node:assert/strict";
import { createRfqStatusEndpoint, type RfqStatusSource } from "../src/lib/rfqStatusEndpoint";
function harness(options: { deny?: boolean; failSave?: boolean; failSnapshot?: boolean } = {}) {
  const writes: string[][] = [], sources: RfqStatusSource[] = [];
  const endpoint = createRfqStatusEndpoint({
    authorize: async source => { sources.push(source); return options.deny ? { ok: false, message: "Not allowed" } : null; },
    save: async (id, status) => { if (options.failSave) throw new Error("database unavailable"); writes.push([id, status]); return { rfqStatus: status, opportunityId: "deal", orderId: null }; },
    snapshot: async () => { if (options.failSnapshot) throw new Error("read unavailable"); return { opportunityId: "deal", quoteProgress: { total: 1, received: 1, state: "complete" } }; },
  });
  const post = (input: unknown, origin = "http://localhost:3001") => endpoint(new Request("http://localhost:3001/api/line-items/item/rfq-status", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(input) }), { params: Promise.resolve({ id: "item" }) });
  return { writes, sources, post };
}
test("RFQ approval returns a compact saved status and current workflow without a page render", async () => {
  const h = harness(), response = await h.post({ rfqStatus: "approved" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, rfqStatus: "approved", workflow: { opportunityId: "deal", quoteProgress: { total: 1, received: 1, state: "complete" } } });
  assert.deepEqual(h.writes, [["item", "approved"]]); assert.deepEqual(h.sources, ["rfq"]);
  assert.match(response.headers.get("server-timing")!, /^rfq-save;dur=\d+/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("deal status changes retain their existing permission source", async () => { const h = harness(); await h.post({ rfqStatus: "quote_received", source: "deal" }); assert.deepEqual(h.sources, ["deal"]); });
test("foreign origins, invalid statuses and permission denials never mutate items", async () => {
  const h = harness();
  assert.equal((await h.post({ rfqStatus: "approved" }, "https://other.example")).status, 403);
  for (const input of [null, {}, { rfqStatus: "won" }, { rfqStatus: true }, { rfqStatus: "approved", source: "admin" }]) assert.equal((await h.post(input)).status, 400);
  assert.deepEqual(h.writes, []);
  const denied = harness({ deny: true }); assert.equal((await denied.post({ rfqStatus: "approved" })).status, 403); assert.deepEqual(denied.writes, []);
});
test("a workflow read failure after approval never becomes a false save failure", async () => {
  const h = harness({ failSnapshot: true }), response = await h.post({ rfqStatus: "approved" });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, rfqStatus: "approved", workflow: null }); assert.equal(h.writes.length, 1);
});
test("an uncertain write failure is reported distinctly for reload-before-retry", async () => {
  const h = harness({ failSave: true }), response = await h.post({ rfqStatus: "approved" });
  assert.equal(response.status, 503); assert.match((await response.json()).message, /Reload/); assert.deepEqual(h.writes, []);
});
