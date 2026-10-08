import test from "node:test";
import assert from "node:assert/strict";
import { createOrderQuoteEndpoint } from "../src/lib/orderQuoteEndpoint";

const context = { params: Promise.resolve({ id: "order" }) };
const quote = { quoteStatus: "sent", quoteUrl: null, quoteSentAt: new Date("2026-10-08T21:44:38Z") };
const post = (origin = "http://localhost:3000", body = JSON.stringify({ quoteStatus: "sent", quoteUrl: "" })) => new Request("http://localhost:3000/api/orders/order/quote", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body });

test("quote endpoint rejects cross-origin and unauthorized requests before reading or writing", async () => {
  let accesses = 0;
  const api = createOrderQuoteEndpoint({ authorize: async () => ({ ok: false, message: "Denied" }), read: async () => { accesses++; return quote; }, save: async () => { accesses++; return { ok: true }; } });
  assert.equal((await api.POST(post("http://untrusted.example"), context)).status, 403);
  assert.equal((await api.POST(post(), context)).status, 403);
  assert.equal((await api.GET(new Request("http://localhost:3000"), context)).status, 403);
  assert.equal(accesses, 0);
});

test("quote endpoint validates the payload without changing the record", async () => {
  let writes = 0;
  const api = createOrderQuoteEndpoint({ authorize: async () => null, read: async () => quote, save: async () => { writes++; return { ok: true }; } });
  for (const body of ["broken JSON", "null", JSON.stringify({ quoteStatus: 1, quoteUrl: "" }), JSON.stringify({ quoteStatus: "sent", quoteUrl: "x".repeat(4001) })]) assert.equal((await api.POST(post(undefined, body), context)).status, 400);
  assert.equal(writes, 0);
});

test("quote save returns the persisted status and timestamp without waiting for unrelated page data", async () => {
  const api = createOrderQuoteEndpoint({ authorize: async () => null, read: async () => quote, save: async (id, input) => { assert.equal(id, "order"); assert.equal(input.quoteStatus, "sent"); return { ok: true }; } });
  const response = await api.POST(post(), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, quote: { ...quote, quoteSentAt: quote.quoteSentAt.toISOString() } });
});

test("an uncertain save result tells the user to check rather than blindly repeat the change", async () => {
  const api = createOrderQuoteEndpoint({ authorize: async () => null, read: async () => { throw new Error("Read timed out"); }, save: async () => ({ ok: true }) });
  const response = await api.POST(post(), context);
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /may have saved.*Check the saved status/);
});
