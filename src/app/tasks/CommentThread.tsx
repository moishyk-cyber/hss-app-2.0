"use client";

import { PendingButton } from "@/lib/ui";
import { addTaskComment } from "./actions";
import { fmtRelative } from "./lib";

type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string | null;
  author: { name: string } | null;
};

export default function CommentThread({ taskId, comments }: { taskId: string; comments: Comment[] }) {
  async function handleAdd(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    if (!body.trim()) return;
    const authorId = typeof window !== "undefined" ? window.localStorage.getItem("hss.salespersonId") : null;
    await addTaskComment(taskId, body, authorId, "Team");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-panel p-3">
      {comments.length === 0 ? (
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
