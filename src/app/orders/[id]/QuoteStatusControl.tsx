"use client";

import { useState } from "react";
import { QUOTE_STATUSES, labelFor } from "@/lib/constants";

export type SavedQuote = { quoteStatus: string; quoteUrl: string | null; quoteSentAt: string | null };
export async function requestQuote(orderId: string, input?: { quoteStatus: string; quoteUrl: string }): Promise<SavedQuote> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api/orders/${orderId}/quote`, { method: input ? "POST" : "GET", ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}), cache: "no-store", signal: controller.signal });
    const result = await response.json().catch(() => ({ ok: false, message: "Could not confirm the saved quote status. Check the saved status before trying again." }));
    if (!response.ok || !result.ok) throw new Error(result.message ?? "Could not save the quote status.");
    return result.quote;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("This request timed out. The change may have saved. Check the saved status before trying again.");
    if (error instanceof TypeError) throw new Error("Could not reach the server. Check the saved status before trying again.");
    throw error;
  } finally { clearTimeout(timer); }
}

export function QuoteStatusControl({ orderId, value, quoteUrl, onSaved }: { orderId: string; value: string; quoteUrl: string | null; onSaved: (quote: SavedQuote) => void }) {
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [needsCheck, setNeedsCheck] = useState(false);
  async function update(next?: string) {
    if (next) setPendingChoice(next); else setChecking(true);
    setMessage("");
    try {
      const quote = await requestQuote(orderId, next ? { quoteStatus: next, quoteUrl: quoteUrl ?? "" } : undefined);
      onSaved(quote); setNeedsCheck(false);
      setMessage(`Saved · ${labelFor(QUOTE_STATUSES, quote.quoteStatus)}`);
    } catch (error) { setNeedsCheck(true); setMessage(error instanceof Error ? error.message : "Could not confirm the change. Check the saved status."); }
    finally { setPendingChoice(null); setChecking(false); }
  }
  return <div id="quote-status" className="rounded-lg p-2 -m-2">
    <label className="flex flex-wrap items-center gap-3"><span className="field-label !mb-0">Quote status</span><select aria-label="Quote status" value={pendingChoice ?? value} disabled={pendingChoice !== null || checking || needsCheck} onChange={event => { void update(event.target.value); }} className="input-klyne text-sm">
      {QUOTE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
    </select></label>
    <p role={needsCheck ? "alert" : "status"} className={`mt-2 text-xs ${needsCheck ? "text-red" : "text-gray-dark"}`}>{pendingChoice !== null ? "Saving quote status…" : checking ? "Checking saved status…" : message || (value === "needed" ? "After sending the quote, choose Quote Sent here." : value === "sent" ? "After customer approval, choose Quote Accepted here." : "Status changes save automatically.")}</p>
    {needsCheck ? <button type="button" disabled={checking} onClick={() => { void update(); }} className="btn btn-sm mt-2">Check saved status</button> : null}
  </div>;
}
