"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileLinkPreview } from "@/lib/FilePreviewModal";
import { safePreviewUrl } from "@/lib/filePreview";
import { Spinner } from "@/lib/ui";

export function ClientQuote({ id, created, sent, url, editable }: {
  id: string; created: boolean; sent: boolean; url: string | null; editable: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ created, sent, url: url ?? "" });
  const [saving, setSaving] = useState(false);
  const [refreshing, refresh] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uncertain) return;
    setSaving(true); setError(""); setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/pipeline/${id}/client-quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values), signal: controller.signal });
      const result = await response.json();
      if (!result.ok) { setError(result.message); if (response.status >= 500) setUncertain(true); return; }
      setValues({ created: result.quote.clientQuoteCreated, sent: result.quote.clientQuoteSent, url: result.quote.clientQuoteUrl ?? "" });
      setMessage("Client quote saved");
      refresh(() => router.refresh());
    } catch { setUncertain(true); setError("Could not confirm the save. Reload to check the saved client quote before trying again."); }
    finally { window.clearTimeout(timeout); setSaving(false); }
  }
  return <section id="client-quote" className="card scroll-mt-6" aria-label="Client quote">
    <h2 className="section-label">Client Quote</h2>
    <p className="mb-4 text-sm text-gray-dark">Create the quote in AutoQuotes or your quoting tool, then send it to the customer. Record those actions here before confirming the deal.</p>
    <form onSubmit={save} className="space-y-4" aria-busy={saving || refreshing}>
      <label className="block"><span className="field-label">Quote document link (optional)</span><input type="url" value={values.url} maxLength={4000} disabled={!editable || saving || uncertain} onChange={e => { setValues(v => ({ ...v, url: e.target.value })); setMessage(""); }} className="input-klyne w-full" placeholder="https://…" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.created} disabled={!editable || saving || uncertain} onChange={e => { const checked=e.target.checked; setValues(v=>({...v,created:checked,sent:checked?v.sent:false})); setMessage(""); }} />Client quote created</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.sent} disabled={!editable || !values.created || saving || uncertain} onChange={e => { const checked=e.target.checked; setValues(v=>({...v,sent:checked})); setMessage(""); }} />Client quote sent to customer</label>
      {error && <p role="alert" className="banner-alert">{error}</p>}
      <div className="flex items-center gap-3">
        {editable && <button type="submit" className="btn btn-primary btn-sm" disabled={saving || uncertain}>{saving ? <><Spinner />Saving…</> : "Save client quote"}</button>}
        {safePreviewUrl(values.url) && <FileLinkPreview url={values.url} name="Client quote" kind="quote" label="Preview client quote" />}
        {uncertain && <button type="button" className="btn btn-sm" onClick={()=>window.location.reload()}>Reload saved details</button>}
        {(message || refreshing) && <span role="status" className="text-xs text-gray-dark">{refreshing ? "Updating workflow…" : message}</span>}
      </div>
    </form>
  </section>;
}
