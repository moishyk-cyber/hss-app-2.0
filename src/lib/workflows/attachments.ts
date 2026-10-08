import type { PrismaClient } from "@prisma/client";
import { DOCUMENT_KINDS, isValidValue } from "../constants";
import { cleanText, TEXT_LIMITS } from "../input";

export class AttachmentValidationError extends Error { }

export type FileLinkedType = "order" | "opportunity" | "purchase_order";
type Target = { linkedType: FileLinkedType; linkedId: string; uploadedBy: string | null };
type Metadata = { fileName: string; mimeType: string; sizeBytes: number };
type Details = { kind: string; note?: string };
type Storage = {
  configured: () => boolean;
  maxBytes: number;
  path: (type: string, id: string, name: string) => string;
  sign: (path: string) => Promise<{ uploadUrl: string; token: string; storagePath: string }>;
  upload: (path: string, bytes: ArrayBuffer, mime: string) => Promise<void>;
  info: (path: string) => Promise<{ mimeType: string; sizeBytes: number }>;
  remove: (path: string) => Promise<void>;
};

/** Both upload transports share policy and Document recording. */
export function createAttachments(db: PrismaClient, storage: Storage) {
  async function target(t: Target) {
    if (!t.linkedId || !["order", "opportunity", "purchase_order"].includes(t.linkedType)) {
      throw new AttachmentValidationError("Not a valid record to attach to.");
    }
    const where = { id: t.linkedId };
    const select = { id: true };
    const row = t.linkedType === "order" ? await db.order.findUnique({ where, select })
      : t.linkedType === "opportunity" ? await db.opportunity.findUnique({ where, select })
        : await db.purchaseOrder.findUnique({ where, select });
    if (!row) throw new AttachmentValidationError("That record no longer exists.");
  }
  function details(d: Details) {
    if (!isValidValue(DOCUMENT_KINDS, d.kind)) throw new AttachmentValidationError("Not a valid file kind.");
    return { kind: d.kind, note: cleanText(d.note, TEXT_LIMITS.medium) || null };
  }
  function metadata(m: Metadata) {
    if (!m.fileName.trim()) throw new AttachmentValidationError("That file has no name.");
    if (m.mimeType !== "application/pdf" && !m.mimeType.startsWith("image/")) {
      throw new AttachmentValidationError("Only PDFs and images can be uploaded.");
    }
    if (!Number.isSafeInteger(m.sizeBytes) || m.sizeBytes <= 0) throw new AttachmentValidationError("That file looks empty or has an invalid size.");
    if (m.sizeBytes > storage.maxBytes) throw new AttachmentValidationError("That file is over the 25 MB limit.");
    return { fileName: cleanText(m.fileName, TEXT_LIMITS.short), mimeType: m.mimeType, sizeBytes: m.sizeBytes };
  }
  function configured() {
    if (!storage.configured()) throw new AttachmentValidationError("Direct upload isn't configured yet - paste a link instead.");
  }
  function ownedPath(t: Target, path: string) {
    const prefix = `${t.linkedType}/${t.linkedId}/`;
    const name = path.startsWith(prefix) ? path.slice(prefix.length) : "";
    if (!name || name === "." || name === ".." || /[/\\]/.test(name)) throw new AttachmentValidationError("That upload does not belong to this record.");
  }
  async function record(t: Target, path: string, m: Metadata, d: Details) {
    return db.document.create({
      data: {
        ...t, ...metadata(m), ...details(d),
        fileUrl: path, storagePath: path, source: "upload"
      }
    });
  }

  return {
    async link(t: Target, input: Details & { url: string; fileName?: string }) {
      await target(t);
      const d = details(input);
      let url: URL;
      try { url = new URL(input.url.trim()); } catch { throw new AttachmentValidationError("Paste a full link starting with http:// or https://"); }
      if (!["http:", "https:"].includes(url.protocol)) throw new AttachmentValidationError("Paste a full link starting with http:// or https://");
      const host = url.hostname.toLowerCase();
      return db.document.create({
        data: {
          ...t, ...d, fileUrl: url.toString(),
          fileName: cleanText(input.fileName, TEXT_LIMITS.short) || null,
          source: host === "drive.google.com" || host === "docs.google.com" ? "google_drive" : "link"
        }
      });
    },
    async start(t: Target, m: Metadata) {
      configured();
      await target(t);
      metadata(m);
      return storage.sign(storage.path(t.linkedType, t.linkedId, m.fileName));
    },
    async finalize(t: Target, input: Metadata & Details & { storagePath: string }) {
      configured();
      await target(t);
      metadata(input);
      details(input);
      ownedPath(t, input.storagePath);
      // Verify uploaded bytes rather than trusting finalization's client metadata.
      const actual = await storage.info(input.storagePath);
      metadata({ fileName: input.fileName, ...actual });
      if (actual.sizeBytes !== input.sizeBytes || actual.mimeType !== input.mimeType) {
        throw new AttachmentValidationError("The uploaded file does not match its details. Please upload it again.");
      }
      return record(t, input.storagePath, input, input);
    },
    async upload(t: Target, file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }, d: Details) {
      configured();
      await target(t);
      const m = metadata({ fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      details(d);
      const path = storage.path(t.linkedType, t.linkedId, file.name);
      await storage.upload(path, await file.arrayBuffer(), file.type);
      try { return await record(t, path, m, d); }
      catch (error) {
        // Direct uploads cannot be retried by finalization; clean up the unused object.
        try { await storage.remove(path); } catch (cleanupError) { console.error("attachment cleanup failed", cleanupError); }
        throw error;
      }
    },
  };
}
