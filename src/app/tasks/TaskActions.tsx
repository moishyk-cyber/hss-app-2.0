"use client";

import { useTransition } from "react";
import { advanceTaskStatus, completeTask } from "./actions";

export default function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      {status !== "done" && (
        <>
          <button
            disabled={pending}
            className="btn btn-sm"
            onClick={() => startTransition(() => advanceTaskStatus(taskId))}
          >
            Advance
          </button>
          <button
            disabled={pending}
            className="btn btn-primary btn-sm"
            onClick={() => startTransition(() => completeTask(taskId))}
          >
            Complete
          </button>
        </>
      )}
    </div>
  );
}
