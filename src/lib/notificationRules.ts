import { stageAssignee } from "./stageAssignments";
import { FLOW_STEPS, type FlowStepKey } from "./ballInCourt";

export type NotificationUser = { id: string; name?: string; role: string; active: boolean };
export type NoticeSnapshot = {
  step: FlowStepKey | null;
  recipients: string[];
  pricingReady: boolean;
  salespersonIds: string[];
  quoteReviewIds: string[];
  billingKind: "deposit" | "payment";
};
export type NoticeInput = { kind: string; title: string; message: string; href: string; recipientIds: string[] };

export function activeRecipients(ids: readonly string[], users: NotificationUser[]) {
  return [...new Set(ids)].filter(id => users.some(user => user.id === id && user.active)).sort();
}

/** The notice goes to the same single teammate as the card and My Items. */
export function courtRecipients(step: FlowStepKey | null, salespersonId: string | null, users: NotificationUser[], settings: Record<string, string>) {
  const user = stageAssignee(step, salespersonId, users, settings);
  return user ? [user.id] : [];
}

function signature(snapshot: NoticeSnapshot) {
  return `${snapshot.step ?? "none"}:${snapshot.recipients.join(",")}:${snapshot.step === "deposit" ? snapshot.billingKind : ""}`;
}

export function planNotifications(previous: NoticeSnapshot | null, next: NoticeSnapshot, record: { title: string; href: string; isDeal: boolean }): NoticeInput[] {
  const notices: NoticeInput[] = [];
  if (!previous && record.isDeal) notices.push({ kind: "quote_review", title: "New deal — verify quotes", message: `Review the requested items and supplier quotes for ${record.title}.`, href: record.href, recipientIds: next.quoteReviewIds });
  const pricingReady = record.isDeal && next.pricingReady && !previous?.pricingReady;
  if (pricingReady) notices.push({ kind: "pricing_ready", title: "Supplier quotes ready — prepare client quote", message: `Supplier quotes are ready for ${record.title}. Prepare and send the client quote.`, href: `${record.href}?step=clientQuote`, recipientIds: next.recipients });
  if (next.step && (!previous || signature(previous) !== signature(next))) {
    const alreadyNotified = notices.flatMap(notice => notice.recipientIds);
    const unchangedStep = previous?.step === next.step && previous.billingKind === next.billingKind;
    const recipientIds = next.recipients.filter(id => !alreadyNotified.includes(id) && !(unchangedStep && previous.recipients.includes(id)));
    const step = FLOW_STEPS.find(step => step.key === next.step)!;
    const billing = next.step === "deposit";
    notices.push({ kind: billing ? `awaiting_${next.billingKind}` : "ball_in_court", title: billing ? `Order waiting for ${next.billingKind === "deposit" ? "a deposit" : "payment"}` : `Your turn — ${step.label}`, message: billing ? `${record.title} is waiting for ${next.billingKind === "deposit" ? "the required deposit" : "payment"}. Review invoices and follow up.` : `${record.title} is now in your court. Review the next step.`, href: billing ? `${record.href}#payments` : record.href, recipientIds });
  }
  return notices.filter(notice => notice.recipientIds.length);
}

/** Date-only task fields use the app's UTC storage convention. */
export function taskDueCutoff(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
