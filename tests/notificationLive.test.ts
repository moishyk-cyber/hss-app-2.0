import test from "node:test";
import assert from "node:assert/strict";
import { notificationChange, notificationArrivals, notificationHref, type LiveNotification, type NotificationChange } from "../src/lib/notificationLiveTypes";
import { notificationInboxRows } from "../src/lib/notificationInbox";
import { notificationStream } from "../src/lib/notificationStream";

const row: LiveNotification = { id: "notice", title: "Your turn — Client Quote", message: "Kitchen is now in your court.", href: "/records/deal", createdAt: "2026-10-23T10:00:00.000Z", readAt: null };
const change: NotificationChange = { operation: "INSERT", notification: row };

test("live payload validation enforces recipient isolation and safe internal links", () => {
  const payload = { eventType: "INSERT", new: { ...row, userId: "mine" } };
  assert.equal(notificationChange(payload, "other"), null);
  assert.deepEqual(notificationChange(payload, "mine"), change);
  assert.equal(notificationChange({ ...payload, new: { ...payload.new, createdAt: "invalid" } }, "mine"), null);
  for (const href of ["https://attacker.example", "//attacker.example", "javascript:alert(1)", "/\\attacker.example", "/\nattacker.example"]) assert.equal(notificationHref(href), "/notifications");
  assert.equal(notificationChange({ ...payload, eventType: "DELETE" }, "mine"), null);
});

test("opening the app is quiet; new rows and reconnect catch-up announce once, never read history", () => {
  assert.deepEqual(notificationArrivals(null, [row], true), []);
  const known = new Set([row.id]);
  const fresh = { ...row, id: "new" };
  assert.deepEqual(notificationArrivals(known, [row, fresh, { ...row, id: "read", readAt: row.createdAt }], true), [fresh]);
  known.add(fresh.id);
  assert.deepEqual(notificationArrivals(known, [fresh], false), []);
});

test("inbox inserts, read state, search, unread filtering and ordering update from pushed rows", () => {
  const fresh = { ...row, id: "fresh", title: "Payment needed", createdAt: "2026-10-23T10:00:01.000Z" };
  assert.deepEqual(notificationInboxRows([row], [fresh, fresh], false, "", null).map(item => item.id), ["fresh", "notice"]);
  assert.deepEqual(notificationInboxRows([row], [fresh], false, "payment", null).map(item => item.id), ["fresh"]);
  assert.deepEqual(notificationInboxRows([row], [{ ...row, readAt: row.createdAt }], true, "", null), []);
  assert.deepEqual(notificationInboxRows([row], [], true, "", row.createdAt), []);
  // An explicit new unread event wins even if client/server clock boundaries coincide.
  assert.deepEqual(notificationInboxRows([], [row], true, "", row.createdAt), [row]);
});

function fixture(overrides: { subscribe?: (listener: { change: (value: NotificationChange) => void; disconnect: () => void }) => Promise<() => void>; heartbeatMs?: number } = {}) {
  let listener!: { change: (value: NotificationChange) => void; disconnect: () => void };
  let reads = 0, released = 0;
  const abort = new AbortController();
  const response = notificationStream({ signal: abort.signal, batchMs: 1, heartbeatMs: overrides.heartbeatMs ?? 60000, lifetimeMs: 60000,
    counts: async () => { reads++; return { unread: 1, total: 1 }; },
    snapshot: async () => { reads++; return { unread: 0, total: 0, latest: [] }; },
    subscribe: async target => { listener = target; return overrides.subscribe ? overrides.subscribe(target) : () => { released++; }; },
  });
  return { response, abort, listener: () => listener, reads: () => reads, released: () => released };
}
const decoder = new TextDecoder();
async function until(reader: ReadableStreamDefaultReader<Uint8Array>, text: string) {
  let output = "";
  while (!output.includes(text)) {
    const value = await reader.read();
    if (value.done) throw new Error(`Stream closed before ${text}`);
    output += decoder.decode(value.value);
  }
  return output;
}

test("stream subscribes before its snapshot and buffers in-flight inserts without dropping them", async () => {
  let released = false;
  const feed = fixture({ subscribe: async target => { target.change(change); return () => { released = true; }; } });
  const reader = feed.response.body!.getReader();
  try {
    const output = await until(reader, '"operation":"INSERT"');
    assert.ok(output.indexOf("event: snapshot") < output.indexOf("event: notifications"));
    assert.ok(output.includes(row.title));
  } finally { feed.abort.abort(); }
  assert.equal(released, true);
});

test("heartbeats do not poll; bursts share one count read and one final row per notification", async () => {
  const feed = fixture({ heartbeatMs: 2 });
  const reader = feed.response.body!.getReader();
  try {
    await until(reader, "event: snapshot");
    await until(reader, ": heartbeat");
    assert.equal(feed.reads(), 1, "idle stream must never repeatedly fetch notification data");
    feed.listener().change(change);
    feed.listener().change({ operation: "UPDATE", notification: { ...row, message: "Updated detail" } });
    const output = await until(reader, "event: notifications");
    assert.equal(feed.reads(), 2);
    assert.equal(output.match(/\"operation\":/g)?.length, 1);
    assert.ok(output.includes('"operation":"INSERT"'));
    assert.ok(output.includes("Updated detail"));
  } finally { feed.abort.abort(); }
  assert.equal(feed.released(), 1);
});

test("disconnects close the stream so EventSource reconnects and obtains a new snapshot", async () => {
  const feed = fixture();
  const reader = feed.response.body!.getReader();
  await until(reader, "event: snapshot");
  feed.listener().disconnect();
  assert.equal((await reader.read()).done, true);
  assert.equal(feed.released(), 1);
});

test("failed subscriptions report reconnecting and do not start a polling fallback", async () => {
  const feed = fixture({ subscribe: async () => { throw new Error("upstream offline"); } });
  const reader = feed.response.body!.getReader();
  const output = await until(reader, "event: unavailable");
  assert.ok(output.includes("reconnecting"));
  assert.equal(feed.reads(), 0);
  assert.equal((await reader.read()).done, true);
});
