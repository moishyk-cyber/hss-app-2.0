"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/lib/IntentLink";
import { FormFooter } from "@/lib/PageLayout";
import { PendingButton } from "@/lib/ui";
import type { PartnerKind } from "@/lib/workflows/deliveryPartners";
import { addDeliveryPartner, renameDeliveryPartner } from "./actions";

export function PartnerForm({ initialKind = "", initialName = "", deliveryId, originalName }: { initialKind?: PartnerKind | ""; initialName?: string; deliveryId?: string; originalName?: string }) {
  const [kind, setKind] = useState<PartnerKind | "">(initialKind);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const router = useRouter();

  async function add() {
    setError(null);
    if (!kind) { setError("Choose Carrier or Trucker."); return; }
    try {
      const result = originalName ? await renameDeliveryPartner(kind, originalName, name) : await addDeliveryPartner(kind, name, deliveryId);
      if (!result.ok) { setError(result.message); return; }
      if (deliveryId) router.back(); else router.push("/carriers-truckers");
      router.refresh();
    } catch { setError("Could not save the name. Please try again."); }
  }
  return <form action={add} className="space-y-6">
    {error && <p role="alert" className="banner-alert">{error}</p>}
    <div className="card space-y-4">
      <label className="block"><span className="field-label">Type (required)</span>
        <select required disabled={!!originalName} value={kind} onChange={event => setKind(event.target.value as PartnerKind | "")} className="input-klyne w-full">
          <option value="">Choose type…</option>
          <option value="carriers">Carrier</option>
          <option value="truckers">Trucker</option>
        </select>
      </label>
      <label className="block"><span className="field-label">Name (required)</span>
        <input required autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} className="input-klyne w-full" />
      </label>
    </div>
    <FormFooter>
      {deliveryId ? <button type="button" className="btn" onClick={() => router.back()}>Cancel</button> : <Link href="/carriers-truckers" className="btn">Cancel</Link>}
      <PendingButton className="btn btn-primary" pendingText="Saving…">{originalName ? "Save changes" : "Create"}</PendingButton>
    </FormFooter>
  </form>;
}
