import test from "node:test";
import assert from "node:assert/strict";
import { CollectionQueryIntent } from "../src/lib/collectionNavigation";

test("typing, sorting and filtering compose before the URL commits", () => {
  const intent = new CollectionQueryIntent();
  intent.stage("/service", "", q => q.set("f_title", "Scale service"));
  const sorted = intent.stage("/service", "", q => q.set("sort", "title:asc"));
  assert.equal(sorted.get("f_title"), "Scale service");
  assert.equal(sorted.get("sort"), "title:asc");
  const filtered = intent.stage("/service", "", q => q.set("f_status", "open"));
  assert.equal(filtered.size, 3);
  // A response for an earlier request cannot erase the newer controls.
  assert.equal(intent.read("/service", sorted.toString()).get("f_status"), "open");
  assert.deepEqual(intent.read("/service", filtered.toString()), filtered);
});

test("a new route, external query or history navigation discards pending intent", () => {
  const intent = new CollectionQueryIntent();
  intent.stage("/service", "", q => q.set("sort", "title:asc"));
  assert.equal(intent.read("/orders", "").size, 0);
  intent.stage("/service", "", q => q.set("sort", "title:asc"));
  assert.equal(intent.read("/service", "f_status=closed").get("sort"), null);
  intent.stage("/service", "", q => q.set("sort", "title:asc"));
  intent.reset();
  assert.equal(intent.read("/service", "").size, 0);
});
