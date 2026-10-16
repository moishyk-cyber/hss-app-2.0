"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/lib/ConfirmDialog";
import { deleteSavedIntake, deleteSavedIntakeItem } from "./deleteActions";

export function DeleteIntakeButton({ id, kind, name }: { id: string; kind: "opportunity" | "order" | "item"; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const label = kind === "item" ? "Delete item" : "Delete intake";
  return <>
    <button type="button" className="btn btn-sm btn-danger" aria-label={`${label}: ${name}`} onClick={() => { setError(null); setOpen(true); }}>{label}</button>
    <ConfirmDialog open={open} title={`${label}?`} confirmLabel={label} danger pending={pending}
      onClose={() => setOpen(false)} onConfirm={() => startTransition(async () => {
        setError(null);
        const result = kind === "item" ? await deleteSavedIntakeItem(id) : await deleteSavedIntake(kind, id);
        if (!result.ok) { setError(result.message); return; }
        setOpen(false);
        if (kind !== "item") router.push(kind === "opportunity" ? "/pipeline" : "/orders");
        router.refresh();
      })}>
      <p>Delete “{name}”{kind === "item" ? "" : " and its items"}? This cannot be undone. Records with payments or fulfillment history are protected.</p>
      {error && <p role="alert" className="banner-alert mt-3">{error}</p>}
    </ConfirmDialog>
  </>;
}
