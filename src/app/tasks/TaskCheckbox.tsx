"use client";

// Split out of TaskRow so both the row itself and the subtask list inside
// TaskModal can use the same quick complete/uncomplete control without the two
// files importing each other.

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/lib/toast";
import { setTaskStatus } from "./actions";

/**
 * The checkbox IS the done/not-done toggle. Completing announces itself with
 * an Undo toast (Sep 2 QA: "every row has a 'Mark task done' check with no
 * undo") - undo restores the status the task had before the click.
 */
export function TaskCheckbox({
  taskId,
  done,
  undoStatus = "not_started",
}: {
  taskId: string;
  done: boolean;
  /** Status to restore when Undo is clicked (the task's status before "done"). */
  undoStatus?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const { toast } = useToast();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimisticDone}
      aria-label={optimisticDone ? "Mark task not done" : "Mark task done"}
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation();
        const next = !optimisticDone;
        startTransition(async () => {
          setOptimisticDone(next);
          const restore = next && undoStatus !== "done" ? undoStatus : "not_started";
          const result = await setTaskStatus(taskId, next ? "done" : "not_started");
          if (result && result.ok === false) {
            toast({ kind: "error", message: result.message });
            return;
          }
          if (next) {
            toast({
              kind: "success",
              message: "Task marked done",
              actionLabel: "Undo",
              onAction: () => setTaskStatus(taskId, restore),
            });
          }
        });
      }}
      className={
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] leading-none transition-colors " +
        (optimisticDone
          ? "border-green bg-green text-white"
          : "border-border text-transparent hover:border-primary")
      }
    >
      ✓
    </button>
  );
}
