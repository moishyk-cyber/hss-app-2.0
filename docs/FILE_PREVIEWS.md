# Attachments and in-app previews

Every attachment opener uses `FilePreviewModal`: record files (including inherited intake documents), PO attachments, pipeline/order kanban documents, and client-quote links on intake and fulfillment records. External shipment tracking and QuickBooks application links remain external destinations; they are not attachment viewers. Phone Book CSV import/export is a data-import tool.

Uploads use the shared `uploadPolicy`, `uploadFile` transport, and `attachments` workflow. The intake form covers both projects and simple orders. `FilesSection` covers deal/order files and PO attachments. All use the shared `FileDropzone` with drag-and-drop, an Attach files button, a removable chosen-file list, and multiple selection. Files upload sequentially; a partially failed batch retains only unfinished files and retries finalization without reuploading completed bytes. All use private signed storage uploads and the same validation/finalization rules.

Supported uploads: PDF, Word `.docx`, and browser-viewable PNG/JPEG/GIF/WebP/AVIF/SVG/BMP/ICO images. The shared cap is 20 MiB, matching the testing bucket and remaining within the production bucket's 25 MiB cap. HEIC/TIFF and legacy `.doc` must be converted first; the form explains unsupported image formats. Google Docs/Drive sharing links use provider preview URLs and still require the provider to permit access/embedding.

PDFs use the local PDF.js renderer with page/zoom controls. Images render directly. Word files are converted on demand in the user's browser, preserving readable headings, lists, tables, and embedded images (not exact Word page layout). Word HTML is isolated in a scriptless sandbox frame with a restrictive CSP and disabled hyperlinks. Signed URLs and file contents are not sent to an external Office conversion service. Viewers show the attachment type/custom name and original filename, with loading/error/retry states.

## Storage configuration

`node --env-file=.env --import tsx scripts/configure-upload-types.ts order-files-testing` checks testing; replace the explicit bucket with `order-files` for production. Add `--apply` to add any missing supported MIME types to an existing restricted allowlist. This preserves the bucket's privacy, size cap, and existing allowed MIME types. Unrestricted private buckets need no changes.

The production allowlist was updated for Word and the supported additional image types on 2026-10-23. No Vercel settings or deployments were changed.

## Verification

- `uploadFile.test.ts` runs PDF, image, and Word uploads through shared start/storage/finalize integration tests for opportunity/intake, order, and purchase-order targets, including network errors, invalid/oversized files, and finalization retries.
- `filePreview.test.ts` covers MIME/extension routing, private signed URLs, unsafe protocols, and Google Drive/Docs embedding.
- Browser QA uses labeled synthetic files on `[LOAD TEST] Automatic stage handoffs`. PDF and image rendering were verified in Chrome; a Word upload and preview is also checked there. Fixtures remain available for review.

## Customer PO in Confirm Deal

Confirm Deal accepts optional Customer PO uploads, stored on the intake as `customer_po` documents and inherited by its order. Selecting a file does not send its bytes through the close action: private uploads finish first, then the existing deal confirmation runs. Failed uploads preserve the selection and retry state. With no file selected, confirmation follows the existing rules without adding a Customer PO prerequisite. Historical customer PO numbers remain stored; supplier AutoQuotes PO numbers in Purchase are unchanged.

Before deploying this type to production, apply `prisma/sql/20261023_customer_po_documents.sql` with the public schema selected. It has been applied to testing only. It also brings the pre-existing `sales_order` file type into the database's allowlist. The migration changes no saved files.
