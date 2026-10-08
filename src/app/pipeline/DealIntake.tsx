"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ValidationDialog } from "@/lib/ValidationDialog";
import type { DealRequirements, ValidationIssue } from "@/lib/dealWorkflow";

import { highlightSection } from "@/lib/SectionLink";

type IntakeValues = { title: string; companyId: string; neededBy: string };
export function DealIntake({ id, title, companyId, neededBy, companies, required }: {
  id: string; title: string; companyId: string | null; neededBy: string;
  companies: { id: string; name: string }[]; required: DealRequirements;
}) {
  const router = useRouter();
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [fieldIssues, setFieldIssues] = useState<ValidationIssue[]>([]);
  const [status, setStatus] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [values, setValues] = useState<IntakeValues>({ title, companyId: companyId ?? "", neededBy });
  const latest = useRef(values);
  const saved = useRef(JSON.stringify(values));
  const busy = useRef(false);
  const uncertain = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function save(showValidation = false) {
    if (timer.current) clearTimeout(timer.current);
    const snapshot = latest.current;
    const key = JSON.stringify(snapshot);
    if (key === saved.current) { setStatus("saved"); return; }
    const invalid: ValidationIssue[] = [];
    if (!snapshot.title.trim()) invalid.push({ field: "title", message: "Enter a deal title." });
    if (required.company && !snapshot.companyId) invalid.push({ field: "companyId", message: "Choose a company." });
    if (required.neededBy && !snapshot.neededBy) invalid.push({ field: "neededByDate", message: "Set the needed-by date." });
    setFieldIssues(invalid);
    if (invalid.length) { setStatus("unsaved"); if (showValidation) setIssues(invalid); return; }
    if (busy.current || uncertain.current) return;
    busy.current = true;
    setStatus("saving");
    const data = new FormData();
    data.set("id", id); data.set("title", snapshot.title); data.set("companyId", snapshot.companyId); data.set("neededByDate", snapshot.neededBy);
    let succeeded = false;
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/pipeline/${id}/intake`, { method: "POST", body: data, signal: controller.signal });
      if (response.status >= 500) uncertain.current = true;
      const result = await response.json();
      if (!result.ok) { setStatus("error"); setIssues(result.issues ?? [{ field: "request", message: result.message }]); }
      else { succeeded = true; saved.current = key; setStatus(key === JSON.stringify(latest.current) ? "saved" : "unsaved"); window.setTimeout(() => router.refresh(), 100); }
    } catch { uncertain.current = true; setStatus("error"); setIssues([{ field: "request", message: "Could not save intake details. Your entries are preserved. Reload to check the saved details before trying again." }]); }
    finally { window.clearTimeout(deadline); busy.current = false; }
    // Serialize saves so an older response can never overwrite a newer edit.
    if (succeeded && key !== JSON.stringify(latest.current)) void save();
  }
  function change(field: keyof IntakeValues, value: string) {
    const next = { ...latest.current, [field]: value };
    latest.current = next; setValues(next); setStatus("unsaved");
    setFieldIssues(current => current.filter(i => i.field !== (field === "neededBy" ? "neededByDate" : field)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 700);
  }
  const errorFor = (field: string) => fieldIssues.find(i => i.field === field);
  return <section ref={section} id="deal-intake" className="card scroll-mt-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="section-label">Intake details</h2>
      <span role="status" className={`text-xs ${status === "saved" ? "text-green" : "text-gray-dark"}`}>{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn’t save" : status === "unsaved" ? "Unsaved changes" : "Changes save automatically"}</span>
    </div>
    <p className="mb-4 text-sm text-gray-dark">Required details help the team price the request and prepare the order.</p>
    <form noValidate onSubmit={e => { e.preventDefault(); void save(true); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) void save(true); }} className="space-y-4">
      <label id="deal-title" className="block"><span className="field-label">Deal title (required)</span><input name="title" value={values.title} onChange={e => change("title", e.target.value)} required maxLength={200} aria-invalid={!!errorFor("title")} aria-describedby={errorFor("title") ? "intake-title-error" : undefined} className="input-klyne w-full" />{errorFor("title") ? <span id="intake-title-error" className="mt-1 block text-xs text-red">{errorFor("title")!.message}</span> : null}</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label id="deal-company" className="block"><span className="field-label">Company{required.company ? " (required)" : " (optional)"}</span><select name="companyId" value={values.companyId} onChange={e => change("companyId", e.target.value)} required={required.company} aria-invalid={!!errorFor("companyId")} aria-describedby={errorFor("companyId") ? "intake-company-error" : undefined} className="input-klyne w-full"><option value="">Choose a company</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{errorFor("companyId") ? <span id="intake-company-error" className="mt-1 block text-xs text-red">{errorFor("companyId")!.message}</span> : null}</label>
        <label id="deal-needed-by" className="block"><span className="field-label">Needed by{required.neededBy ? " (required)" : " (optional)"}</span><input name="neededByDate" type="date" required={required.neededBy} value={values.neededBy} onChange={e => change("neededBy", e.target.value)} aria-invalid={!!errorFor("neededByDate")} aria-describedby={errorFor("neededByDate") ? "intake-date-error" : undefined} className="input-klyne w-full" />{errorFor("neededByDate") ? <span id="intake-date-error" className="mt-1 block text-xs text-red">{errorFor("neededByDate")!.message}</span> : null}</label>
      </div>
      {status === "error" ? <button type="button" className="btn btn-sm" onClick={() => { if (uncertain.current) window.location.reload(); else void save(true); }}>{uncertain.current ? "Reload saved details" : "Retry saving"}</button> : null}
    </form>
    <ValidationDialog issues={issues} onClose={() => setIssues([])} onFix={() => { const issue = issues[0]; setIssues([]); requestAnimationFrame(() => highlightSection(issue?.field === "companyId" ? "#deal-company" : issue?.field === "neededByDate" ? "#deal-needed-by" : "#deal-title", section.current)); }} />
  </section>;
}
