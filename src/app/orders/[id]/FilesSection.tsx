"use client";

// Files tab (and the same card on the deal page): every Document linked to this
// record, plus the deal's own files when an order came from one - drawings and
// quotes arrive during sales and nobody should have to go hunting for them.
//
// Two ways to add a file:
//  - "Paste a link" - any http(s) URL (Google Drive share links are labeled as
//    such), which always works.
//  - "Upload a file" - PDF or image, max 25 MB. The browser asks the server for
//    a signed upload URL, PUTs the bytes straight to Supabase Storage (they
//    never pass through the app server), then the server records the Document.
//    With no storage configured this mode says so and points at links instead.

import { useRef, useState } from "react";
import { DOCUMENT_KINDS, labelFor } from "@/lib/constants";
import { uploadFile, type UploadAttempt } from "@/lib/uploadFile";
import { UPLOAD_ACCEPT } from "@/lib/uploadPolicy";
import { fmtDateUTC } from "@/lib/dates";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { FormAlert, PendingButton, Spinner } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import {
  createLinkDocument,
  createSignedUpload,
  deleteDocument,
  finalizeUpload,
  getSignedDownloadUrl,
  type FileLinkedType,
} from "../../files/actions";

export type FileDocData = {
  id: string;
  kind: string;
  fileUrl: string;
  fileName: string | null;
  source: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  uploadedBy: string | null;
  note: string | null;
  uploadedAt: Date;
};

/** Module-local: file kinds have no shared color map (only this surface shows them). */
const KIND_COLORS: Record<string, string> = {
  quote: "badge-blue",
  invoice: "badge-green",
  drawing: "badge-yellow",
  po: "badge-orange",
  tracking: "badge-blue",
  other: "badge-gray",
};

const ACCEPT = UPLOAD_ACCEPT;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** "Google Drive" for a Drive/Docs link, else "Upload" or "Link". */
function sourceLabel(doc: FileDocData): string {
  if (doc.source === "upload") return "Upload";
  const host = hostOf(doc.fileUrl);
  if (host === "drive.google.com" || host === "docs.google.com") return "Google Drive";
  return "Link";
}

function displayName(doc: FileDocData): string {
  if (doc.fileName) return doc.fileName;
  if (doc.source === "upload") return "Uploaded file";
  return hostOf(doc.fileUrl) ?? doc.fileUrl;
}

function fmtSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function OpenUpload({ documentId }: { documentId: string }) {
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  async function open() {
    // The tab is opened synchronously so the browser credits it to the click,
    // then pointed at the signed URL once it comes back (popup blockers).
    const tab = window.open("", "_blank", "noopener,noreferrer");
    setPending(true);
    const result = await getSignedDownloadUrl(documentId);
    setPending(false);
    if (result.ok === false) {
      tab?.close();
      toast({ kind: "error", message: result.message });
      return;
    }
    if (tab) tab.location.href = result.url;
    else window.location.href = result.url;
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className={`btn btn-sm active:scale-[0.99] ${pending ? "cursor-progress opacity-60" : ""}`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Spinner />
          Open
        </span>
      ) : (
        "Open"
      )}
    </button>
  );
}

function DeleteFile({ doc }: { doc: FileDocData }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  async function run() {
    setPending(true);
    const result = await deleteDocument(doc.id);
    setPending(false);
    setConfirming(false);
    if (result.ok === false) {
      toast({ kind: "error", message: result.message });
      return;
    }
    toast({ kind: "success", message: "File removed." });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-sm active:scale-[0.99]"
        aria-label={`Delete ${displayName(doc)}`}
      >
        Delete
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete this file?"
        confirmLabel="Delete"
        danger
        pending={pending}
        onConfirm={run}
        onClose={() => setConfirming(false)}
      >
        {doc.storagePath
          ? `"${displayName(doc)}" and its stored copy will be deleted. This cannot be undone.`
          : `"${displayName(doc)}" will be removed from this record. The linked file itself is not touched.`}
      </ConfirmDialog>
    </>
  );
}

function FileRow({ doc, canDelete }: { doc: FileDocData; canDelete: boolean }) {
  const size = fmtSize(doc.sizeBytes);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <span className={`badge shrink-0 ${KIND_COLORS[doc.kind] ?? "badge-gray"}`}>
        {labelFor(DOCUMENT_KINDS, doc.kind)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{displayName(doc)}</span>
        <span className="block text-[12px] text-gray-dark">
          {sourceLabel(doc)}
          {size ? ` · ${size}` : ""} · {fmtDateUTC(doc.uploadedAt)}
          {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}
        </span>
        {doc.note ? <span className="block text-[12px] text-gray-dark">{doc.note}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {doc.storagePath ? (
          <OpenUpload documentId={doc.id} />
        ) : (
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm active:scale-[0.99]"
          >
            Open
          </a>
        )}
        {canDelete ? <DeleteFile doc={doc} /> : null}
      </span>
    </div>
  );
}

function KindSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <label className="block w-40">
      <span className="field-label">Kind</span>
      <select name="kind" defaultValue={defaultValue} className="input-klyne w-full">
        {DOCUMENT_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function FilesSection({
  linkedType,
  linkedId,
  docs,
  ownLabel,
  inheritedDocs = [],
  inheritedLabel = "From the deal",
  uploadsEnabled,
  compact = false,
  defaultKind = "other",
  addLabel = "+ Add a file",
  emptyText = "No files here yet. Paste a link or upload a PDF or drawing above.",
}: {
  linkedType: FileLinkedType;
  linkedId: string;
  docs: FileDocData[];
  /** Heading for this record's own files, e.g. "On this order". */
  ownLabel: string;
  /** Files that belong to a related record (the order's deal), shown read-through. */
  inheritedDocs?: FileDocData[];
  inheritedLabel?: string;
  uploadsEnabled: boolean;
  /**
   * Drops the "Files" section heading, the ownLabel subheading, and the
   * inherited-docs block - for embedding inside a surface that already has
   * its own heading (the PO modal's "AutoQuotes PDF" block).
   */
  compact?: boolean;
  /** Preselected kind on the add form, e.g. "po" for a purchase-order attachment. */
  defaultKind?: string;
  addLabel?: string;
  emptyText?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  async function submitLink(formData: FormData) {
    setError(null);
    const result = await createLinkDocument(linkedType, linkedId, {
      url: String(formData.get("url") ?? ""),
      kind: String(formData.get("kind") ?? "other"),
      note: String(formData.get("note") ?? ""),
      fileName: String(formData.get("fileName") ?? ""),
    });
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "Link added." });
    setFormKey((k) => k + 1);
    setAdding(false);
  }

  const uploadAttempt = useRef<UploadAttempt | null>(null);

  async function submitUpload(formData: FormData) {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) {
      setError("Pick a file to upload.");
      return;
    }
    const kind = String(formData.get("kind") ?? "other");
    const note = String(formData.get("note") ?? "");
    const result = await uploadFile(file, uploadAttempt, {
      start: () => createSignedUpload(linkedType, linkedId, file.name, file.type, file.size),
      finish: (signed) => finalizeUpload(linkedType, linkedId, {
        storagePath: signed.storagePath, fileName: file.name,
        mimeType: file.type, sizeBytes: file.size, kind, note,
      }),
    });
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    toast({ kind: "success", message: "File uploaded." });
    setFormKey((k) => k + 1);
    setAdding(false);
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {compact ? (
        !adding && (
          <div className="flex justify-end">
            <button type="button" onClick={() => setAdding(true)} className="btn btn-sm active:scale-[0.99]">
              {addLabel}
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="section-label !mb-0">Files</h3>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="btn btn-sm active:scale-[0.99]">
              {addLabel}
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="card space-y-3">
          <div role="tablist" aria-label="How to add a file" className="flex gap-1 border-b border-border">
            {(
              [
                { key: "link" as const, label: "Paste a link" },
                { key: "upload" as const, label: "Upload a file" },
              ]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={mode === t.key}
                onClick={() => {
                  setMode(t.key);
                  setError(null);
                }}
                className={
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
                  (mode === t.key
                    ? "border-primary text-ink font-semibold"
                    : "border-transparent text-gray hover:text-ink")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && <FormAlert>{error}</FormAlert>}

          {mode === "link" ? (
            <form key={`link-${formKey}`} action={submitLink} className="space-y-3">
              <label className="block">
                <span className="field-label">Link *</span>
                <input
                  name="url"
                  required
                  autoFocus
                  placeholder="https://drive.google.com/..."
                  className="input-klyne w-full"
                />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <KindSelect defaultValue={defaultKind} />
                <label className="block min-w-48 flex-1">
                  <span className="field-label">File name</span>
                  <input name="fileName" placeholder="Optional" className="input-klyne w-full" />
                </label>
              </div>
              <label className="block">
                <span className="field-label">Note</span>
                <input name="note" placeholder="Optional" className="input-klyne w-full" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <PendingButton className="btn btn-primary active:scale-[0.99]" pendingText="Saving…">
                  Add link
                </PendingButton>
              </div>
            </form>
          ) : !uploadsEnabled ? (
            <p className="text-sm text-gray-dark">
              Direct upload isn&rsquo;t configured yet - paste a link instead.
            </p>
          ) : (
            <form key={`upload-${formKey}`} onSubmit={async event => {
              event.preventDefault();
              if (uploadLock.current) return;
              const data = new FormData(event.currentTarget);
              uploadLock.current = true;
              setUploading(true);
              try { await submitUpload(data); }
              finally { uploadLock.current = false; setUploading(false); }
            }}>
              <fieldset disabled={uploading} className="space-y-3">
                <label className="block">
                  <span className="field-label">File * (PDF or image, max 25 MB)</span>
                  <input ref={fileRef} type="file" accept={ACCEPT} required className="input-klyne w-full" />
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <KindSelect defaultValue={defaultKind} />
                  <label className="block min-w-48 flex-1">
                    <span className="field-label">Note</span>
                    <input name="note" placeholder="Optional" className="input-klyne w-full" />
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary active:scale-[0.99]" disabled={uploading} aria-busy={uploading}>
                    {uploading ? <><Spinner /> Uploading…</> : "Upload"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
      )}

      <div className="space-y-2">
        {!compact && <h4 className="field-label">{ownLabel}</h4>}
        {docs.length === 0 ? (
          <div className={compact ? "text-xs text-gray-dark" : "empty-state"}>{emptyText}</div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border px-4">
            {docs.map((doc) => (
              <FileRow key={doc.id} doc={doc} canDelete />
            ))}
          </div>
        )}
      </div>

      {!compact && inheritedDocs.length > 0 && (
        <div className="space-y-2">
          <h4 className="field-label">{inheritedLabel}</h4>
          <div className="divide-y divide-border rounded-lg border border-border px-4">
            {inheritedDocs.map((doc) => (
              <FileRow key={doc.id} doc={doc} canDelete />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
