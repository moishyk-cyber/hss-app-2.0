"use client";

// Google-Tasks-style quick add (Aug 31 feedback): type a title, hit Enter,
// done. Assignee defaults to the "Working as" identity - no form to fill in.
// CreateTaskPanel (the floating + button) stays available for anything that
// needs a due date, priority, type, or a linked record up front.
//
// Sep 2 QA: adding now says what it did (a toast naming the defaults, with
// Undo), and the typed text survives navigating away - it's kept in this
// browser until it's submitted or cleared.

import { useState, useSyncExternalStore, useTransition } from "react";
import { Spinner } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { deleteTask, quickAddTask } from "./actions";

const DRAFT_KEY = "hss.taskQuickAddDraft";

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}
function serverDraft(): string {
  return "";
}
function writeDraft(value: string) {
  try {
    if (value) window.localStorage.setItem(DRAFT_KEY, value);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export default function QuickAddTask() {
  // The stored draft is the initial value (survives navigate-away); once the
  // user types here, the local override wins and writes through to storage.
  const storedDraft = useSyncExternalStore(subscribeStorage, readDraft, serverDraft);
  const [override, setOverride] = useState<string | null>(null);
  const title = override ?? storedDraft;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function setTitle(next: string) {
    setOverride(next);
    writeDraft(next);
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await quickAddTask(trimmed);
      if (result.ok === false) {
        setError(result.message);
      } else {
        setTitle("");
        toast({
          kind: "success",
          message: `Task added${
            result.assigneeName ? ` - assigned to ${result.assigneeName}` : " (unassigned)"
          }, Medium priority. Open it to set a due date.`,
          actionLabel: "Undo",
          onAction: () => deleteTask(result.id),
        });
      }
    });
  }

  return (
    <div className="task-quick-add flex flex-wrap items-center gap-2">
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
        placeholder="Quick add a task — press Enter"
        aria-label="Add a task"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-gray "
      />
      <button type="button" className="btn btn-sm" disabled={isPending || !title.trim()} onClick={submit}>{isPending ? <Spinner/> : "Add task"}</button>
      {error && (
        <span role="alert" className="text-xs text-red">
          {error}
        </span>
      )}
    </div>
  );
}
