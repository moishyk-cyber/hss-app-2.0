"use client";

// Client wrapper for the "Company details (PO PDF)" form - a plain <form
// action={saveCompanySettings}> can't be used directly from the server
// component above because saveCompanySettings returns ActionResult (form
// actions want void | Promise<void>), so this local handler calls it and
// surfaces the result as a toast/banner like every other write in the app.

import { useState } from "react";
import { PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { saveCompanySettings } from "./actions";

export function CompanySettingsForm({
  name,
  address,
  phone,
  email,
  footer,
}: {
  name: string;
  address: string;
  phone: string;
  email: string;
  footer: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSave(formData: FormData) {
    const result = await saveCompanySettings(formData);
    if (result.ok) {
      setError(null);
      toast({ kind: "success", message: "Company details saved" });
    } else {
      setError(result.message);
    }
  }

  return (
    <form action={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {error && (
        <div role="alert" className="banner-alert col-span-1 sm:col-span-2">
          {error}
        </div>
      )}
      <label className="block">
        <span className="field-label">Company name</span>
        <input name="name" defaultValue={name} placeholder="HSS Kitchen Equipment Inc" className="input-klyne w-full" />
      </label>
      <label className="block">
        <span className="field-label">Phone</span>
        <input name="phone" defaultValue={phone} className="input-klyne w-full" />
      </label>
      <label className="col-span-1 block sm:col-span-2">
        <span className="field-label">Address</span>
        <input name="address" defaultValue={address} placeholder="Brooklyn, NY" className="input-klyne w-full" />
      </label>
      <label className="block">
        <span className="field-label">Email</span>
        <input type="email" name="email" defaultValue={email} className="input-klyne w-full" />
      </label>
      <label className="col-span-1 block sm:col-span-2">
        <span className="field-label">PDF footer</span>
        <textarea name="footer" defaultValue={footer} rows={2} className="input-klyne w-full" />
      </label>
      <div className="col-span-1 sm:col-span-2">
        <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Saving…">
          Save company details
        </PendingButton>
      </div>
    </form>
  );
}
