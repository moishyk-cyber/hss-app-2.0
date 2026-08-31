"use client";

// Comments as a chat (Moishy, Aug 31: "make this more of a chat thing"):
// avatar + bubble per message, your own messages on the right in the accent
// bubble, composer pinned at the bottom with a Send button. Clears and
// refetches after send; auto-scrolls to the newest message.

import { useEffect, useRef, useState, useTransition } from "react";
import { readStoredUserId } from "@/lib/identityClient";
import { PendingButton, Spinner } from "@/lib/ui";
import { Avatar } from "@/lib/Avatar";
import { addTaskComment, getTaskComments } from "./actions";
import type { TaskCommentData } from "./actions";
import { fmtRelative } from "./lib";

export default function CommentThread({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<TaskCommentData[] | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const myId = typeof window !== "undefined" ? readStoredUserId() : null;

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

  useEffect(() => {
    // Newest message into view whenever the thread changes.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [comments]);

  async function handleAdd(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    if (!body.trim()) return;
    await addTaskComment(taskId, body, readStoredUserId());
    formRef.current?.reset();
    setComments(await getTaskComments(taskId));
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-panel">
      <div ref={scrollRef} className="max-h-64 space-y-3 overflow-y-auto p-3">
        {comments === null ? (
          <div className="flex items-center gap-2 text-xs text-gray">
            <Spinner /> Loading comments…
          </div>
        ) : comments.length === 0 ? (
          <div className="text-xs text-gray">No comments yet - start the conversation below.</div>
        ) : (
          comments.map((c) => {
            const name = c.author?.name ?? c.authorName ?? "Team";
            const mine = !!myId && c.author != null && c.authorId === myId;
            return (
              <div key={c.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar name={name} kind="person" size="sm" />
                <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                  <div className="px-1 text-[10.5px] text-gray">
                    {mine ? "" : `${name} · `}
                    {fmtRelative(c.createdAt)}
                  </div>
                  <div
                    className={`inline-block rounded-2xl px-3 py-1.5 text-left text-sm ${
                      mine
                        ? "rounded-br-sm bg-ink text-white"
                        : "rounded-bl-sm bg-hover text-ink"
                    }`}
                  >
                    {c.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form ref={formRef} action={handleAdd} className="flex items-center gap-2 border-t border-border p-2">
        <input
          name="body"
          className="input-klyne flex-1 rounded-full"
          placeholder="Write a message…"
          autoComplete="off"
          required
        />
        <PendingButton className="btn btn-primary btn-sm rounded-full active:scale-[0.99]" pendingText="…">
          Send
        </PendingButton>
      </form>
    </div>
  );
}
