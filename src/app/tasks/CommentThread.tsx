"use client";

import { useEffect, useState, useTransition } from "react";
import { readStoredUserId } from "@/lib/identityClient";
import { PendingButton, Spinner } from "@/lib/ui";
import { addTaskComment, getTaskComments } from "./actions";
import type { TaskCommentData } from "./actions";
import { fmtRelative } from "./lib";

export default function CommentThread({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<TaskCommentData[] | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const data = await getTaskComments(taskId);
      if (!cancelled) setComments(data);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function handleAdd(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    if (!body.trim()) return;
    const authorId = readStoredUserId();
    await addTaskComment(taskId, body, authorId);
    const fresh = await getTaskComments(taskId);
    setComments(fresh);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
      {comments === null ? (
        <div className="flex items-center gap-2 text-xs text-gray">
          <Spinner /> Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <div className="text-xs text-gray">No comments yet.</div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium text-ink">{c.author?.name ?? c.authorName ?? "Team"}</span>{" "}
              <span className="text-xs text-gray">{fmtRelative(c.createdAt)}</span>
              <div className="text-gray-dark">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form action={handleAdd} className="flex items-center gap-2">
        <input name="body" className="input-klyne flex-1" placeholder="Add a comment…" required />
        <PendingButton className="btn btn-primary btn-sm active:scale-[0.99]" pendingText="Posting…">
          Post
        </PendingButton>
      </form>
    </div>
  );
}
