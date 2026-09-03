"use server";

// Document (file) actions shared by the order Files tab and the deal Files card.
//
// Two ways in, one Document row either way:
//  - "Paste a link"  -> createLinkDocument (source link | google_drive)
//  - "Upload a file" -> createSignedUpload -> browser PUT -> finalizeUpload
//    (source upload; the bytes live in the private Supabase bucket, and are
//    read back through a 1-hour signed URL from getSignedDownloadUrl).
//
// Every write is guarded by files.edit, logged, and revalidates the surface it
// shows on. Uploads are optional: with no Supabase env vars the upload actions
// return a friendly "paste a link instead" message and links keep working.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction, type ActionResult } from "@/lib/actionResult";
import { logActivity } from "@/lib/log";
import { requirePermission } from "@/lib/permissionsServer";
import { currentUserName } from "@/lib/identityServer";
import { DOCUMENT_KINDS, isValidValue, labelFor } from "@/lib/constants";
import {
  MAX_UPLOAD_BYTES,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  removeObject,
  storagePathFor,
  uploadsConfigured,
} from "@/lib/storage";

/** The records a file can hang off in this UI. */
export type FileLinkedType = "order" | "opportunity";

export type SignedUploadResult =
  | { ok: true; uploadUrl: string; token: string; storagePath: string }
  | { ok: false; message: string };

export type SignedUrlResult = { ok: true; url: string } | { ok: false; message: string };

const NOT_CONFIGURED = "Direct upload isn't configured yet - paste a link instead.";

/** Uploads we accept: PDFs and images (the file input asks for the same set). */
function isAllowedMime(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

function isLinkedType(value: string): value is FileLinkedType {
  return value === "order" || value === "opportunity";
}

/** Google Drive share links get their own source so the list can label them. */
function sourceForUrl(url: URL): "link" | "google_drive" {
  const host = url.hostname.toLowerCase();
  return host === "drive.google.com" || host === "docs.google.com" ? "google_drive" : "link";
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function revalidateFor(linkedType: string, linkedId: string): void {
  if (linkedType === "order") {
    revalidatePath(`/orders/${linkedId}`);
    revalidatePath("/orders");
  } else if (linkedType === "opportunity") {
    revalidatePath(`/pipeline/${linkedId}`);
    revalidatePath("/pipeline");
  }
}

async function log(linkedType: string, linkedId: string, action: string, detail: string) {
  await logActivity(linkedType, linkedId, action, detail);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function createLinkDocument(
  linkedType: FileLinkedType,
  linkedId: string,
  input: { url: string; kind: string; note?: string; fileName?: string }
): Promise<ActionResult> {
  const denied = await requirePermission("files.edit");
  if (denied) return denied;

  if (!isLinkedType(linkedType) || !linkedId) return { ok: false, message: "Not a valid record to attach to." };
  const url = parseHttpUrl(input.url ?? "");
  if (!url) return { ok: false, message: "Paste a full link starting with http:// or https://" };
  if (!isValidValue(DOCUMENT_KINDS, input.kind)) return { ok: false, message: "Not a valid file kind." };

  const fileName = (input.fileName ?? "").trim() || null;
  const note = (input.note ?? "").trim() || null;

  return safeAction(async () => {
    const uploadedBy = await currentUserName();
    const doc = await prisma.document.create({
      data: {
        linkedType,
        linkedId,
        kind: input.kind,
        fileUrl: url.toString(),
        fileName,
        source: sourceForUrl(url),
        note,
        uploadedBy,
      },
    });
    await log(
      linkedType,
      linkedId,
      "document_linked",
      `${labelFor(DOCUMENT_KINDS, doc.kind)} link added${fileName ? `: ${fileName}` : ""}`
    );
    revalidateFor(linkedType, linkedId);
  }, "Could not save that link. Please try again.");
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/**
 * Step 1 of an upload: mint a signed upload URL for a path under this record.
 * The browser then does:
 *   PUT <uploadUrl>  (content-type: <mimeType>, x-upsert: false, body: the file)
 * and calls finalizeUpload with the returned storagePath.
 */
export async function createSignedUpload(
  linkedType: FileLinkedType,
  linkedId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number
): Promise<SignedUploadResult> {
  // Narrowed with `ok === false` because this action's success shape carries
  // the signed URL, so a bare ActionResult is not assignable to it.
  const denied = await requirePermission("files.edit");
  if (denied && denied.ok === false) return denied;

  if (!uploadsConfigured()) return { ok: false, message: NOT_CONFIGURED };
  if (!isLinkedType(linkedType) || !linkedId) return { ok: false, message: "Not a valid record to attach to." };
  if (!fileName.trim()) return { ok: false, message: "That file has no name." };
  if (!isAllowedMime(mimeType)) return { ok: false, message: "Only PDFs and images can be uploaded." };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, message: "That file looks empty." };
  if (sizeBytes > MAX_UPLOAD_BYTES) return { ok: false, message: "That file is over the 25 MB limit." };

  try {
    const signed = await createSignedUploadUrl(storagePathFor(linkedType, linkedId, fileName));
    return { ok: true, ...signed };
  } catch (err) {
    console.error("createSignedUpload failed", err);
    return { ok: false, message: "Could not start the upload. Please try again." };
  }
}

/** Step 2: the bytes are in the bucket - record the Document row. */
export async function finalizeUpload(
  linkedType: FileLinkedType,
  linkedId: string,
  input: {
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    kind: string;
    note?: string;
  }
): Promise<ActionResult> {
  const denied = await requirePermission("files.edit");
  if (denied) return denied;

  if (!uploadsConfigured()) return { ok: false, message: NOT_CONFIGURED };
  if (!isLinkedType(linkedType) || !linkedId) return { ok: false, message: "Not a valid record to attach to." };
  if (!isValidValue(DOCUMENT_KINDS, input.kind)) return { ok: false, message: "Not a valid file kind." };
  // The path must sit under this record's own prefix - never trust a client path.
  if (!input.storagePath || !input.storagePath.startsWith(`${linkedType}/${linkedId}/`)) {
    return { ok: false, message: "That upload does not belong to this record." };
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) return { ok: false, message: "That file is over the 25 MB limit." };

  const fileName = input.fileName.trim() || "Uploaded file";
  const note = (input.note ?? "").trim() || null;

  return safeAction(async () => {
    const uploadedBy = await currentUserName();
    await prisma.document.create({
      data: {
        linkedType,
        linkedId,
        kind: input.kind,
        // Uploads are read back through a signed URL, so no durable public URL
        // exists - the storage path is the address that matters.
        fileUrl: input.storagePath,
        fileName,
        source: "upload",
        mimeType: input.mimeType || null,
        sizeBytes: Math.round(input.sizeBytes),
        storagePath: input.storagePath,
        note,
        uploadedBy,
      },
    });
    await log(
      linkedType,
      linkedId,
      "document_uploaded",
      `${labelFor(DOCUMENT_KINDS, input.kind)} uploaded: ${fileName}`
    );
    revalidateFor(linkedType, linkedId);
  }, "Could not save that upload. Please try again.");
}

/** A 1-hour link to an uploaded file. Reads aren't logged. */
export async function getSignedDownloadUrl(documentId: string): Promise<SignedUrlResult> {
  if (!uploadsConfigured()) return { ok: false, message: NOT_CONFIGURED };
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { storagePath: true },
    });
    if (!doc?.storagePath) return { ok: false, message: "That file has no stored copy to open." };
    return { ok: true, url: await createSignedDownloadUrl(doc.storagePath) };
  } catch (err) {
    console.error("getSignedDownloadUrl failed", err);
    return { ok: false, message: "Could not open that file. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const denied = await requirePermission("files.edit");
  if (denied) return denied;

  return safeAction(async () => {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error("Document not found");
    // Row first, then the object: an orphaned object costs nothing, while a row
    // left pointing at a deleted object is a broken "Open" button. A storage
    // hiccup must not block removing the file from the record either.
    await prisma.document.delete({ where: { id: documentId } });
    if (doc.storagePath && uploadsConfigured()) {
      try {
        await removeObject(doc.storagePath);
      } catch (err) {
        console.error("storage object delete failed", err);
      }
    }
    await log(
      doc.linkedType,
      doc.linkedId,
      "document_deleted",
      `${labelFor(DOCUMENT_KINDS, doc.kind)} removed${doc.fileName ? `: ${doc.fileName}` : ""}`
    );
    revalidateFor(doc.linkedType, doc.linkedId);
  }, "Could not delete that file. Please try again.");
}
