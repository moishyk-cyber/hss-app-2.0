import type { PrismaClient } from "@prisma/client";
import { serialTransaction } from "./transaction";

export const SERVICE_NOTE_ACTION = "service_issue_note_added";
export const MAX_SERVICE_NOTE_LENGTH = 4000;
export function serviceNoteProblem(raw: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return "Enter a note or update.";
  if (raw.trim().length > MAX_SERVICE_NOTE_LENGTH) return "Keep the note to 4,000 characters or fewer.";
  return null;
}

/** Notes are durable, authored activity entries; a failed write must reach the caller. */
export async function addServiceNote(db: PrismaClient, issueId: string, raw: string, author: { id: string; name: string }) {
  const problem = serviceNoteProblem(raw);
  if (problem) throw new Error(problem);
  if (!author.id || !author.name.trim()) throw new Error("Sign in before adding a note.");
  return serialTransaction(db, async tx => {
    const issue = await tx.serviceIssue.findUnique({ where: { id: issueId }, select: { orderId: true, companyId: true } });
    if (!issue) throw new Error("Service issue not found");
    const note = await tx.activityLog.create({ data: {
      linkedType: "service_issue", linkedId: issueId, action: SERVICE_NOTE_ACTION,
      detail: raw.trim(), userId: author.id, userName: author.name, at: new Date(),
    } });
    return { note, issue };
  });
}
