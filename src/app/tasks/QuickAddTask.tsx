"use client";

// Google-Tasks-style quick add (Aug 31 feedback): type a title, hit Enter,
// done. Assignee defaults to the "Working as" identity - no form to fill in.
// CreateTaskPanel (the floating + button) stays available for anything that
// needs a due date, priority, type, or a linked record up front.

import { useState, useTransition } from "react";
import { readStoredUserId } from "@/lib/identityClient";
import { Spinner } from "@/lib/ui";
import { quickAddTask } from "./actions";

export default function QuickAddTask() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await quickAddTask(trimmed, readStoredUserId());
      if (result && result.ok === false) {
        setError(result.message);
      } else {
        setTitle("");
      }
    });
  }

  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border text-sm text-gray"
      >
        +
      </span>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={isPending}
        placeholder="Add a task"
        aria-label="Add a task"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-gray focus:outline-none"
      />
      {isPending && <Spinner className="text-gray" />}
      {error && (
        <span role="alert" className="text-xs text-red">
          {error}
        </span>
      )}
    </div>
  );
}
