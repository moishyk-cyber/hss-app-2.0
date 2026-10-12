"use client";

import { ConfirmDialog } from "./ConfirmDialog";
import type { ValidationIssue } from "./dealWorkflow";

export function ValidationDialog({ issues, title = "Complete the required fields", onClose, onFix }: {
  issues: ValidationIssue[]; title?: string; onClose: () => void; onFix: () => void;
}) {
  return <ConfirmDialog open={issues.length > 0} title={title} confirmLabel="Fix required fields" cancelLabel="Keep editing" onConfirm={onFix} onClose={onClose}>
    <p className="mb-3">Nothing has changed. Complete these requirements, then try again.</p>
    <ul className="space-y-2" aria-label="Missing requirements">
      {issues.map((issue, i) => <li key={`${issue.field}-${i}`} className="flex items-start gap-2"><span aria-hidden="true" className="text-orange">!</span><span>{issue.message}</span></li>)}
    </ul>
  </ConfirmDialog>;
}
