import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrderWorkflowEndpoint } from "../src/lib/orderWorkflowEndpoint";
const context = { params: Promise.resolve({ id: "order" }) };
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/orders/order/workflow", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
function fixture(overrides: Partial<Parameters<typeof createOrderWorkflowEndpoint>[0]> = {}) {
  const writes: unknown[] = [];
  return { writes, post: createOrderWorkflowEndpoint({ actionNames: ["terms"], authorize: async () => null, ownsTarget: async () => true, save: async (action, args) => { writes.push([action, args]); return { ok: true }; }, snapshot: async () => ({ steps: ["terms completed"], payments: [] }), ...overrides }) };
}
test("workflow requests enforce origin, allowlist and permissions before mutations", async () => {
  const f = fixture();
  assert.equal((await f.post(request({ action: "terms", args: ["order", "Net 30"] }, "https://elsewhere.test"), context)).status, 403);
  assert.equal((await f.post(request({ action: "deleteOrder", args: ["order"] }), context)).status, 400);
  const denied = fixture({ authorize: async () => ({ ok: false, message: "No access" }) });
  assert.equal((await denied.post(request({ action: "terms", args: ["order"] }), context)).status, 403);
  assert.equal(f.writes.length + denied.writes.length, 0);
});
test("cross-order targets and malformed input cannot write", async () => {
  const f = fixture({ ownsTarget: async () => false });
  assert.equal((await f.post(request({ action: "terms", args: ["other-order"] }), context)).status, 400);
  assert.equal((await f.post(request({ action: "terms", args: [42] }), context)).status, 400);
  assert.equal(f.writes.length, 0);
});
test("successful save returns persisted workflow evidence without page-render dependencies", async () => {
  const f = fixture(); const response = await f.post(request({ action: "terms", args: ["order", "Net 30"] }), context);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, steps: ["terms completed"], payments: [] });
  assert.equal(f.writes.length, 1);
});
test("validation failures remain visible; uncertain saved state never claims success", async () => {
  const invalid = fixture({ save: async () => ({ ok: false, message: "Terms too long" }) });
  assert.equal((await invalid.post(request({ action: "terms", args: ["order"] }), context)).status, 400);
  const uncertain = fixture({ snapshot: async () => { throw new Error("Read timed out after write"); } });
  const response = await uncertain.post(request({ action: "terms", args: ["order"] }), context);
  assert.equal(response.status, 503); assert.match((await response.json()).message, /check the saved state/); assert.equal(uncertain.writes.length, 1);
});
