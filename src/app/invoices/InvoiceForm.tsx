"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/lib/BackLink";
import { FormFooter } from "@/lib/PageLayout";
import { MoneyInput } from "@/lib/MoneyInput";
import { FormAlert, PendingButton } from "@/lib/ui";
import { SearchCombobox, type ComboboxOption } from "@/lib/Combobox";
import { PAYMENT_TYPES } from "@/app/orders/utils";
import { addInvoice } from "@/app/orders/actions";
import { useToast } from "@/lib/toast";

export default function InvoiceForm({ orders }: { orders: ComboboxOption[] }) {
  const [orderId, setOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function create(form: FormData) {
    if (!orderId) { setError("Choose an order for this billing record."); return; }
    setError(null);
    const result = await addInvoice(orderId, String(form.get("type")), Number(form.get("amount")),
      String(form.get("quickbooksLink") ?? ""), String(form.get("dueDate") ?? ""), String(form.get("status")));
    if (!result.ok) { setError(result.message); return; }
    toast({ kind: "success", message: "Billing record created" });
    let destination = "/invoices";
    try {
      const saved = sessionStorage.getItem("hss:return:/invoices/new");
      if (saved && saved.startsWith("/") && !saved.startsWith("//")) destination = saved;
    } catch { /* Use the invoices collection when browser storage is unavailable. */ }
    router.push(destination);
    router.refresh();
  }

  return <form action={create} className="card space-y-4">
    {error && <FormAlert>{error}</FormAlert>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <SearchCombobox label="Order" options={orders} selectedId={orderId} query={query}
          setQuery={value => { setQuery(value); setOrderId(""); }}
          onPick={option => { setOrderId(option.id); setQuery(option.name); }}
          onCreate={() => {}} allowCreate={false} required emptyText="No matching orders. Create an order through New Intake first." />
      </div>
      <label><span className="field-label">Record type</span><select name="type" className="input-klyne w-full">{PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      <label><span className="field-label">Amount</span><MoneyInput required min="0.01" name="amount" className="input-klyne w-full" /></label>
      <label><span className="field-label">Status</span><select name="status" className="input-klyne w-full" defaultValue="pending"><option value="pending">Pending — invoice not issued</option><option value="invoiced">Invoiced — awaiting payment</option></select></label>
      <label><span className="field-label">Due date</span><input type="date" name="dueDate" className="input-klyne w-full" /></label>
      <label className="sm:col-span-2"><span className="field-label">QuickBooks link</span><input type="url" name="quickbooksLink" placeholder="https://…" className="input-klyne w-full" /></label>
    </div>
    <FormFooter><BackLink href="/invoices" label="Cancel" className="btn" /><PendingButton className="btn btn-primary" pendingText="Creating…">Create record</PendingButton></FormFooter>
  </form>;
}
