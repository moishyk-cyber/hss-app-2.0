"use client";

import { useState } from "react";
import { PendingButton } from "@/lib/ui";
import { createUser } from "./actions";

export function NewUserForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Add teammate
      </button>
    );
  }

  return (
    <form
      className="card flex flex-wrap items-end gap-4"
      action={async (formData) => {
        const result = await createUser(formData);
        if (result.ok) {
          setOpen(false);
          setError(null);
        } else {
          setError(result.message);
        }
      }}
    >
      <div className="min-w-[160px] flex-1">
        <span className="field-label">Full name</span>
        <input name="name" required className="input-klyne w-full" placeholder="Herman Freund" />
      </div>
      <div className="min-w-[200px] flex-1">
        <span className="field-label">Email</span>
        <input name="email" type="email" required className="input-klyne w-full" placeholder="name@hsskitchens.com" />
      </div>
      <div className="min-w-[140px]">
        <span className="field-label">Role</span>
        <input name="role" list="team-role-suggestions" defaultValue="sales" className="input-klyne w-full" />
      </div>
      <div className="flex gap-2">
        <PendingButton className="btn btn-primary" pendingText="Adding…">
          Add
        </PendingButton>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && (
        <span role="alert" className="banner-warn w-full">
          {error}
        </span>
      )}
    </form>
  );
}
