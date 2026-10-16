"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PendingButton } from "@/lib/ui";
import { addServiceIssueNote } from "./actions";

export function NoteComposer({ issueId }: { issueId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  async function add() {
    setError(null); setSaved(false); setSaving(true);
    try {
      const result = await addServiceIssueNote(issueId, body);
      if (!result.ok) { setError(result.message); return; }
      setBody(""); setSaved(true); router.refresh();
    } catch { setError("Could not save your update. Please try again."); }
    finally { setSaving(false); }
  }
  return <form action={add} className="space-y-3">
    <label className="block"><span className="field-label">Note or update</span>
      <textarea required maxLength={4000} rows={3} value={body} disabled={saving}
        onChange={event => { setBody(event.target.value); setSaved(false); }}
        placeholder="Add a progress update, call summary, or next step…" className="input-klyne w-full" />
    </label>
    {error && <p role="alert" className="banner-alert">{error}</p>}
    <div className="flex items-center gap-3">
      <PendingButton className="btn btn-primary btn-sm" pendingText="Saving…">Add update</PendingButton>
      {saved && <span role="status" className="text-sm text-gray-dark">Update saved.</span>}
    </div>
  </form>;
}
