"use client";

// Split out of TaskRow so both the row itself and the subtask list inside
// TaskModal can use the same quick complete/uncomplete control without the two
// files importing each other.

import { useOptimistic, useTransition } from "react";
import { setTaskStatus } from "./actions";

/** The checkbox IS the done/not-done toggle - unchecking sends it back to Not Started. */
export function TaskCheckbox({ taskId, done }: { taskId: string; done: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);

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
          await setTaskStatus(taskId, next ? "done" : "not_started");
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
