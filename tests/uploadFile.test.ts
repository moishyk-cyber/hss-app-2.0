import test from "node:test";
import assert from "node:assert/strict";
import { uploadFiles, uploadFile, type UploadAttempt } from "../src/lib/uploadFile";
import { DOCX_MIME, MAX_UPLOAD_BYTES, uploadProblem } from "../src/lib/uploadPolicy";
import { createAttachments, type FileLinkedType } from "../src/lib/workflows/attachments";
import { memoryDatabase, fixture } from "./memoryDatabase";

const pdf = () => new File(["%PDF-1.7\n", new Uint8Array(2 * 1024 * 1024)], "drawing.pdf", { type: "application/pdf" });

test("multiple attachments resume failed finalization without duplicating earlier files or uploading bytes twice", async () => {
  let remaining = [pdf(), new File(['word'], 'terms.docx', { type: DOCX_MIME })];
  const attempt = { current: null as UploadAttempt | null };
  const stored: string[] = [], finalized: string[] = [];
  let fail = true;
  const operations = (file: File) => ({
    start: async () => ({ ...signed, storagePath: file.name }),
    fetch: async () => { stored.push(file.name); return new Response('{}'); },
    finish: async () => {
      if (file.name === 'terms.docx' && fail) { fail = false; throw new Error('Disconnected'); }
      finalized.push(file.name); return success;
    },
  });
  const uploaded = (file: File) => { remaining = remaining.filter(selected => selected !== file); };
  assert.equal((await uploadFiles(remaining, attempt, operations, uploaded)).ok, false);
  assert.deepEqual(remaining.map(file => file.name), ['terms.docx']);
  assert.equal((await uploadFiles(remaining, attempt, operations, uploaded)).ok, true);
  assert.equal(remaining.length, 0);
  assert.deepEqual(stored, ['drawing.pdf', 'terms.docx']);
  assert.deepEqual(finalized, ['drawing.pdf', 'terms.docx']);
});

test("an invalid selection stops the whole batch before sending any file", async () => {
  const result = await uploadFiles([pdf(), new File(['bad'], 'script.js', { type: 'text/javascript' })], { current: null }, () => { assert.fail('No upload should start'); }, () => { assert.fail('No file should be saved'); });
  assert.equal(result.ok, false);
});
const signed = { ok: true as const, uploadUrl: "https://storage.example/upload?token=temporary", storagePath: "order/order/drawing.pdf" };
const success = { ok: true as const };

// The same uploader serves intake (both outcomes), deals, orders and both PO screens.
for (const [surface, linkedType, linkedId] of [
  ["project intake", "opportunity", "deal"], ["priced order intake", "order", "order"],
  ["deal Files", "opportunity", "deal"], ["order Files", "order", "order"],
  ["order purchase-order panel", "purchase_order", "po"], ["purchase-order detail", "purchase_order", "po"],
] as const) {
  test(`${surface}: PDF above 1 MB and image upload record correct private Documents`, async () => {
    const m = memoryDatabase(fixture());
    const objects = new Map<string, { mimeType: string; sizeBytes: number }>();
    let pathNumber = 0;
    const attachments = createAttachments(m.db, {
      configured: () => true, maxBytes: MAX_UPLOAD_BYTES,
      path: (type, id, name) => `${type}/${id}/${++pathNumber}-${name}`,
      sign: async path => ({ storagePath: path, uploadUrl: `https://storage.example/${path}`, token: "temporary" }),
      upload: async () => { throw new Error("Bytes must bypass the app server"); },
      info: async path => { const object = objects.get(path); assert.ok(object); return object; },
      remove: async path => { objects.delete(path); },
    });
    const target = { linkedType: linkedType as FileLinkedType, linkedId, uploadedBy: "Sales" };
    for (const file of [pdf(), new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" }), new File(["word document fixture"], "terms.docx", { type: DOCX_MIME })]) {
      const metadata = { fileName: file.name, mimeType: file.type, sizeBytes: file.size };
      const result = await uploadFile(file, { current: null }, {
        start: async () => ({ ok: true, ...await attachments.start(target, metadata) }),
        fetch: async (url, init) => {
          assert.equal(init?.method, "PUT");
          assert.equal(init?.body, file);
          assert.equal((init?.headers as Record<string, string>)["content-type"], file.type);
          const bytes = await (init?.body as File).arrayBuffer();
          objects.set(new URL(String(url)).pathname.slice(1), { mimeType: file.type, sizeBytes: bytes.byteLength });
          return new Response("{}", { status: 200 });
        },
        finish: async upload => { await attachments.finalize(target, { ...metadata, storagePath: upload.storagePath, kind: "drawing" }); return success; },
      });
      assert.deepEqual(result, success);
    }
    const documents = m.state().document;
    assert.equal(documents.length, 3);
    assert.ok(documents.every(document => document.linkedType === linkedType && document.linkedId === linkedId && document.source === "upload"));
    assert.equal(documents[0].sizeBytes, pdf().size);
    assert.equal(objects.size, 3);
  });
}

test("all file pickers reject empty, oversized and unsupported files before contacting storage", async () => {
  for (const file of [new File([], "empty.pdf", { type: "application/pdf" }),
    new File(["hello"], "note.txt", { type: "text/plain" }),
    new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.pdf", { type: "application/pdf" })]) {
    const result = await uploadFile(file, { current: null }, {
      start: async () => { assert.fail("Invalid file must not start an upload"); },
      finish: async () => { assert.fail("Invalid file must not be recorded"); },
    });
    assert.equal(result.ok, false);
  }
  assert.equal(uploadProblem({ name: "limit.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES }), null);
});

test("missing configuration is surfaced without sending file bytes", async () => {
  const result = await uploadFile(pdf(), { current: null }, {
    start: async () => ({ ok: false, message: "Uploads are not configured." }),
    fetch: async () => { assert.fail("No upload without a signed URL"); },
    finish: async () => { assert.fail("No recording without an upload"); },
  });
  assert.deepEqual(result, { ok: false, message: "Uploads are not configured." });
});

test("storage rejection and network errors stay visible and permit a fresh attempt", async () => {
  for (const fail of [async () => new Response("rejected", { status: 403 }), async () => { throw new Error("offline"); }]) {
    const attempt = { current: null as UploadAttempt | null };
    let saves = 0;
    const operations = { start: async () => signed, fetch: fail, finish: async () => { saves++; return success; } };
    assert.equal((await uploadFile(pdf(), attempt, operations)).ok, false);
    assert.equal(attempt.current, null);
    assert.equal(saves, 0);
    assert.deepEqual(await uploadFile(pdf(), attempt, { ...operations, fetch: async () => new Response("{}") }), success);
    assert.equal(saves, 1);
  }
});

test("failed Document save retries finalization without sending the bytes twice", async () => {
  const attempt = { current: null as UploadAttempt | null };
  const file = pdf();
  let starts = 0, uploads = 0, saves = 0;
  const operations = {
    start: async () => { starts++; return signed; },
    fetch: async () => { uploads++; return new Response("{}"); },
    finish: async () => { if (++saves === 1) throw new Error("Action connection lost"); return success; },
  };
  assert.equal((await uploadFile(file, attempt, operations)).ok, false);
  assert.equal(attempt.current?.uploaded, true);
  assert.deepEqual(await uploadFile(file, attempt, operations), success);
  assert.deepEqual({ starts, uploads, saves }, { starts: 1, uploads: 1, saves: 2 });
  assert.equal(attempt.current, null);
});

test("image uploads are limited to formats the in-app image viewer supports", () => {
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/bmp']) {
    assert.equal(uploadProblem({ name: 'picture', type, size: 100 }), null);
  }
  for (const type of ['image/heic', 'image/tiff']) {
    assert.match(uploadProblem({ name: 'picture', type, size: 100 })!, /Convert HEIC or TIFF/);
  }
});
