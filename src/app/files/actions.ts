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
import { DOCUMENT_KINDS, labelFor } from "@/lib/constants";
import {
  createSignedDownloadUrl,
  removeObject,
  uploadsConfigured,
} from "@/lib/storage";

import { attachments } from "@/lib/workflows";
import { AttachmentValidationError, type FileLinkedType } from "@/lib/workflows/attachments";
export type { FileLinkedType } from "@/lib/workflows/attachments";

export type SignedUploadResult =
  | { ok: true; uploadUrl: string; token: string; storagePath: string }
  | { ok: false; message: string };

export type SignedUrlResult = { ok: true; url: string } | { ok: false; message: string };

const NOT_CONFIGURED = "Direct upload isn't configured yet - paste a link instead.";

async function attachmentAction(work: () => Promise<void>, message: string): Promise<ActionResult> {
  try { await work(); return { ok: true }; }
  catch (error) {
    if (error instanceof AttachmentValidationError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message };
  }
}

/**
 * A "purchase_order" document is polymorphic against the PO, not the order -
 * so revalidating the order page it lives on means resolving the PO's orderId
 * first. A PO that has since been deleted just skips the revalidate.
 */
async function revalidateFor(linkedType: string, linkedId: string): Promise<void> {
  if (linkedType === "order") {
    revalidatePath(`/orders/${linkedId}`);
    revalidatePath("/orders");
  } else if (linkedType === "opportunity") {
    revalidatePath(`/pipeline/${linkedId}`);
    revalidatePath("/pipeline");
  } else if (linkedType === "purchase_order") {
    revalidatePath(`/purchase-orders/${linkedId}`);
    const po = await prisma.purchaseOrder.findUnique({ where: { id: linkedId }, select: { orderId: true } });
    if (po) {
      revalidatePath(`/orders/${po.orderId}`);
      revalidatePath("/orders");
    }
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

  return attachmentAction(async () => {
    const doc = await attachments.link({ linkedType, linkedId, uploadedBy: await currentUserName() }, input);
    const fileName = doc.fileName;
    await log(
      linkedType,
      linkedId,
      "document_linked",
      `${labelFor(DOCUMENT_KINDS, doc.kind)} link added${fileName ? `: ${fileName}` : ""}`
    );
    await revalidateFor(linkedType, linkedId);
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

  try {
    const signed = await attachments.start({ linkedType, linkedId, uploadedBy: null }, { fileName, mimeType, sizeBytes });
    return { ok: true, ...signed };
  } catch (err) {
    if (err instanceof AttachmentValidationError) return { ok: false, message: err.message };
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

  return attachmentAction(async () => {
    const doc = await attachments.finalize({ linkedType, linkedId, uploadedBy: await currentUserName() }, input);
    const fileName = doc.fileName;
    await log(
      linkedType,
      linkedId,
      "document_uploaded",
      `${labelFor(DOCUMENT_KINDS, input.kind)} uploaded: ${fileName}`
    );
    await revalidateFor(linkedType, linkedId);
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
    await revalidateFor(doc.linkedType, doc.linkedId);
  }, "Could not delete that file. Please try again.");
}
