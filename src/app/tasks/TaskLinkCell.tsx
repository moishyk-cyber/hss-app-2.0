"use client";

import { useOptimistic, useState, useTransition } from "react";
import LinkedRecordPicker from "./LinkedRecordPicker";
import { setTaskLink } from "./actions";
import type { SearchResult } from "./actions";
import { linkedHref, TYPE_LABELS } from "./lib";

type Link = { type: string | null; id: string | null; label: string | null };

export default function TaskLinkCell({
  taskId,
  linkedType,
  linkedId,
  linkedLabel,
}: {
  taskId: string;
  linkedType: string | null;
  linkedId: string | null;
  linkedLabel: string | null;
}) {
  const [link, setLink] = useOptimistic<Link>({ type: linkedType, id: linkedId, label: linkedLabel });
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelect(choice: SearchResult) {
    startTransition(async () => {
      setLink({ type: choice.type, id: choice.id, label: choice.label });
      await setTaskLink(taskId, choice.type, choice.id);
      setEditing(false);
    });
  }

  if (!editing) {
    const href = linkedHref(link.type, link.id);
    return (
      <div className="flex items-center gap-1.5">
        {link.type && href ? (
          <a href={href} className={`text-xs text-blue transition-colors hover:underline ${isPending ? "opacity-60" : ""}`}>
            <span className="badge badge-gray mr-1 text-[10px]">{TYPE_LABELS[link.type]}</span>
            {link.label}
          </a>
        ) : (
          <span className="empty-value">no link</span>
        )}
        <button
          type="button"
          className="text-xs text-gray transition-colors hover:text-ink"
          onClick={() => setEditing(true)}
          title="Change linked record"
          aria-label="Change linked record"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="w-56">
      <LinkedRecordPicker onSelect={handleSelect} autoFocus />
      <button type="button" className="mt-1 text-xs text-gray transition-colors hover:text-ink" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  );
}
