import test from "node:test";
import assert from "node:assert/strict";
import { CARD_FILE_KINDS, previewKind, safePreviewUrl } from "../src/lib/filePreview";
test("previews only allow HTTP links and preserve signed query parameters", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "file:///private/file.pdf", "invalid"]) assert.equal(safePreviewUrl(bad), null);
  assert.equal(safePreviewUrl("https://storage.example/file.pdf?token=signed"), "https://storage.example/file.pdf?token=signed");
});
test("card document categories and image preview detection cover uploads and pasted links", () => {
  assert.deepEqual(CARD_FILE_KINDS.map(entry => entry.label), ["Quote", "Sales Order", "PO", "Invoice"]);
  assert.equal(previewKind({ mimeType: "image/png", fileName: "quote", fileUrl: "https://example.test/blob" }), "image");
  assert.equal(previewKind({ mimeType: null, fileName: "Quote", fileUrl: "https://example.test/quote.jpg?signed=1" }), "image");
  assert.equal(previewKind({ mimeType: "application/pdf", fileName: "quote.pdf", fileUrl: "https://example.test/pdf" }), "pdf");
});
