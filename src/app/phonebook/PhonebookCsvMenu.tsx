"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CSV_MAX_BYTES, parseCsv, validatePhonebookRow } from "@/lib/phonebookCsv";
import { useDialogAccessibility } from "@/lib/useDialogAccessibility";
import { useToast } from "@/lib/toast";

function TransferIcon({ direction }: { direction: "up" | "down" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 16v4h16v-4" />
    <path d={direction === "up" ? "M12 16V4m-4 4 4-4 4 4" : "M12 4v12m-4-4 4 4 4-4"} />
  </svg>;
}

export function PhonebookCsvMenu({ canImport }: { canImport: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const selection = useRef(0);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  useDialogAccessibility(panel, open, () => setOpen(false), pending);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", escape); };
  }, []);
  function closeMenu() {
    if (!menu.current?.open) return;
    menu.current.open = false;
    menu.current.querySelector("summary")?.focus();
  }
  async function download(sample: boolean) {
    closeMenu();
    setDownloading(true);
    try {
      const response = await fetch(`/api/phonebook/csv${sample ? "?sample=1" : ""}`);
      if (!response.ok || !response.headers.get("content-type")?.includes("text/csv")) throw new Error("Download failed. Sign in again or try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = sample ? "phonebook-sample.csv" : "phonebook.csv";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast({ kind: "error", message: error instanceof Error ? error.message : "Download failed. Try again." }); }
    finally { setDownloading(false); }
  }
  async function chooseFile(selected: File | null) {
    const version = ++selection.current;
    setFile(null); setPreview(""); setError("");
    if (!selected) return;
    try {
      if (!selected.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a .csv file.");
      if (selected.size > CSV_MAX_BYTES) throw new Error("Choose a CSV smaller than 2 MB.");
      const rows = parseCsv(await selected.text());
      if (version !== selection.current) return;
      rows.forEach((row, index) => validatePhonebookRow(row, index + 2));
      const businesses = rows.filter(row => row.kind === "business").length;
      setPreview(`${businesses} businesses and ${rows.length - businesses} people. ${rows.filter(row => row.id).length} rows will update existing records by ID.`);
      setFile(selected);
    } catch (error) { if (version === selection.current) setError(error instanceof Error ? error.message : "Unable to read this CSV."); }
  }
  async function importFile() {
    if (!file || pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/phonebook/csv", { method: "POST", headers: { "Content-Type": "text/csv; charset=utf-8" }, body: file });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign in again, then retry the import.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Import failed. Try again.");
      toast({ kind: "success", message: result.message });
      setOpen(false); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Import failed. Try again."); }
    finally { setPending(false); }
  }
  return <>
    <details ref={menu} className="toolbar-display phonebook-csv-menu">
      <summary className="toolbar-icon-button" aria-label="Phone Book actions" title="Phone Book actions">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </summary>
      <div className="toolbar-display-panel phonebook-csv-options">
        <button type="button" disabled={!canImport || downloading} onClick={() => { closeMenu(); setFile(null); setPreview(""); setError(""); setOpen(true); }}><TransferIcon direction="up" />Import CSV</button>
        <button type="button" disabled={downloading} onClick={() => void download(false)}><TransferIcon direction="down" />Export CSV</button>
        {!canImport && <p className="text-xs text-gray-dark">Your role cannot import Phone Book records.</p>}
      </div>
    </details>
    {open && createPortal(<div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[12vh]" onClick={event => { if (event.target === event.currentTarget && !pending) setOpen(false); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="card w-full max-w-lg space-y-4 outline-none">
        <h2 id={titleId} className="text-base font-semibold">Import Phone Book CSV</h2>
        <p className="text-sm text-gray-dark">Add businesses and people together. Leave id blank for new records; keep an exported id to update a record. Included blank cells clear optional fields. People must link to a business by companyName or companyId.</p>
        <button type="button" className="btn btn-sm" disabled={pending || downloading} onClick={() => void download(true)}><TransferIcon direction="down" />Download sample CSV</button>
        <label className="block text-sm font-medium">CSV file
          <input type="file" accept=".csv,text/csv" disabled={pending} className="input-klyne mt-2 w-full" onChange={event => void chooseFile(event.target.files?.[0] ?? null)} aria-describedby={`${titleId}-help`} />
        </label>
        <p id={`${titleId}-help`} className="text-xs text-gray-dark">UTF-8 CSV · up to 1,000 records · maximum 2 MB. All rows are checked before any changes are saved. Export includes the full Phone Book.</p>
        {preview && <p role="status" className="text-sm">{preview}</p>}
        {error && <p role="alert" className="text-sm text-red">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" className="btn" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!file || pending} aria-busy={pending} onClick={() => void importFile()}>{pending ? "Importing…" : "Import records"}</button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
