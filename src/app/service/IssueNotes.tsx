import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissionsServer";
import { SERVICE_NOTE_ACTION } from "@/lib/workflows/serviceNotes";
import { fmtDateUTC } from "@/lib/dates";
import { MoreRecords } from "@/lib/CollectionWindow";
import { NoteComposer } from "./NoteComposer";

export async function IssueNotes({ issueId, limit }: { issueId: string; limit: number }) {
  const [rows, editable] = await Promise.all([
    prisma.activityLog.findMany({ where: { linkedType: "service_issue", linkedId: issueId, action: SERVICE_NOTE_ACTION }, orderBy: [{ at: "desc" }, { id: "desc" }], take: limit + 1 }),
    can("service.edit"),
  ]);
  const hasMore = rows.length > limit;
  const notes = rows.slice(0, limit);
  return <section className="card space-y-5" aria-labelledby="issue-notes-heading">
    <h2 id="issue-notes-heading" className="section-label">Notes &amp; updates</h2>
    {editable && <NoteComposer issueId={issueId} />}
    {notes.length ? <ul className="divide-y divide-border">
      {notes.map(note => <li key={note.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-ink">{note.userName ?? "Team member"}</span>
          <time dateTime={note.at.toISOString()} title={note.at.toISOString()} className="text-xs text-gray-dark">{fmtDateUTC(note.at)}</time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-ink">{note.detail}</p>
      </li>)}
    </ul> : <p className="empty-value text-sm">No notes or updates yet.</p>}
    <MoreRecords href={`/service/${issueId}`} limit={limit} hasMore={hasMore} />
  </section>;
}
