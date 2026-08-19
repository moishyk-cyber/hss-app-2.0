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
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
            onClick={() => startTransition(() => advanceTaskStatus(taskId))}
          >
            Advance
          </button>
          <button
            disabled={pending}
            className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
            onClick={() => startTransition(() => completeTask(taskId))}
          >
            Complete
          </button>
        </>
      )}
    </div>
  );
}
