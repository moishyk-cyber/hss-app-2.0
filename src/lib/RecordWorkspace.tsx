import type { ReactNode } from "react";

/** Preserve the intake layout: workflow above, read-only details left, selected work right. */
export function RecordWorkspace({ navigation, summary, children }: { navigation: ReactNode; summary?: ReactNode; children: ReactNode }) {
  if (!navigation && !summary) return <div className="record-workspace-editor">{children}</div>;
  return <>{navigation}<div className="record-workspace">
    <aside className="record-workspace-sidebar" aria-label="Record details">{summary}</aside>
    <div className="record-workspace-editor" aria-label="Selected workflow section">{children}</div>
  </div></>;
}
