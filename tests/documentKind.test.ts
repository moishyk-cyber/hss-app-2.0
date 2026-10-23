import test from "node:test";
import assert from "node:assert/strict";
import { documentKindLabel } from "../src/lib/documentKind";

test("Other uses its saved note as the custom type and keeps older unnamed files readable", () => {
  assert.equal(documentKindLabel({ kind: "other", note: "  Warranty  " }), "Warranty");
  for (const note of [null, undefined, "", "   "]) assert.equal(documentKindLabel({ kind: "other", note }), "Other");
});

test("standard file notes never replace their type label", () => {
  assert.equal(documentKindLabel({ kind: "quote", note: "Updated customer quote" }), "Quote");
  assert.equal(documentKindLabel({ kind: "po", note: "Signed copy" }), "Purchase Order");
});

test("customer PO files have their own type, separate from supplier purchase orders", () => {
  assert.equal(documentKindLabel({ kind: "customer_po" }), "Customer PO");
  assert.equal(documentKindLabel({ kind: "po" }), "Purchase Order");
});
