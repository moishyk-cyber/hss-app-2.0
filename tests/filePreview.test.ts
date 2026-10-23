import test from "node:test";
import assert from "node:assert/strict";
import { CARD_FILE_KINDS, embeddedPreviewUrl, previewKind, safePreviewUrl } from "../src/lib/filePreview";
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

test("uploaded MIME types take priority and named linked PDFs/images render directly in the modal", () => {
  assert.equal(previewKind({ mimeType: "application/pdf", fileName: "quote.jpg", fileUrl: "https://example.test/file.jpg" }), "pdf");
  assert.equal(previewKind({ mimeType: null, fileName: "quote.pdf", fileUrl: "https://example.test/download?id=1" }), "pdf");
  assert.equal(previewKind({ mimeType: null, fileName: "Drawing", fileUrl: "https://example.test/file.svg" }), "image");
});

test("Drive and Docs sharing links resolve to in-app embed URLs without losing Drive access keys", () => {
  assert.equal(embeddedPreviewUrl("https://drive.google.com/file/d/file_123/view?usp=sharing&resourcekey=key_456"), "https://drive.google.com/file/d/file_123/preview?resourcekey=key_456");
  assert.equal(embeddedPreviewUrl("https://drive.google.com/open?id=file_123"), "https://drive.google.com/file/d/file_123/preview");
  assert.equal(embeddedPreviewUrl("https://docs.google.com/document/d/doc_123/edit"), "https://docs.google.com/document/d/doc_123/preview");
  assert.equal(embeddedPreviewUrl("https://drive.google.com.attacker.test/file/d/123/view"), "https://drive.google.com.attacker.test/file/d/123/view");
  assert.equal(embeddedPreviewUrl("javascript:alert(1)"), null);
  assert.equal(embeddedPreviewUrl("https://storage.example/file.pdf?token=signed"), "https://storage.example/file.pdf?token=signed");
});

test("Word uploads and signed/download links use the native Word preview; Google sharing pages stay embedded", () => {
  assert.equal(previewKind({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileName: 'Terms', fileUrl: 'https://storage.example/blob?token=private' }), 'docx');
  assert.equal(previewKind({ mimeType: null, fileName: 'Terms.docx', fileUrl: 'https://example.test/download?id=1' }), 'docx');
  assert.equal(previewKind({ mimeType: null, fileName: null, fileUrl: 'https://example.test/terms.DOCX?token=signed' }), 'docx');
  assert.equal(previewKind({ mimeType: null, fileName: 'Quote.pdf', fileUrl: 'https://drive.google.com/file/d/123/view' }), 'frame');
  assert.equal(previewKind({ mimeType: null, fileName: 'Terms.docx', fileUrl: 'https://docs.google.com/document/d/123/edit' }), 'frame');
});
