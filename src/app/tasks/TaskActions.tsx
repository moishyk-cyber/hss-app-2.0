"use client";

import { ActionButton } from "@/lib/ui";
import { advanceTaskStatus, completeTask } from "./actions";

export default function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  return (
    <div className="flex gap-2">
      {status !== "done" && (
        <>
          <ActionButton action={() => advanceTaskStatus(taskId)} className="btn btn-sm active:scale-[0.99]">
            Advance
          </ActionButton>
          <ActionButton action={() => completeTask(taskId)} className="btn btn-primary btn-sm active:scale-[0.99]">
            Complete
          </ActionButton>
        </>
      )}
    </div>
  );
}
