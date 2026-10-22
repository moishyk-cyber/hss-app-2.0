import { RFQ_STATUSES, isValidValue } from "./constants";
import { hasSameOrigin } from "./requestOrigin";
import type { ActionResult } from "./actionResult";
import type { supplierQuoteProgress } from "./ballInCourt";
export type RfqStatusSource = "rfq" | "deal";
export type RfqSavedStatus = { rfqStatus: string; opportunityId: string | null; orderId: string | null; quoteProgress?: ReturnType<typeof supplierQuoteProgress> | null };
export type RfqWorkflowSnapshot = { opportunityId: string; quoteProgress: ReturnType<typeof supplierQuoteProgress> };
export function createRfqStatusEndpoint(deps: {
  authorize: (source: RfqStatusSource) => Promise<ActionResult | null>;
  save: (id: string, status: string) => Promise<RfqSavedStatus>;
  snapshot: (saved: RfqSavedStatus) => Promise<RfqWorkflowSnapshot | null>;
}) {
  return async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!hasSameOrigin(request)) return Response.json({ ok: false, message: "Reload the page before saving." }, { status: 403 });
    const started = performance.now();
    try {
      let input: unknown;
      try { input = await request.json(); } catch { return Response.json({ ok: false, message: "Choose a valid RFQ status." }, { status: 400 }); }
      if (!input || typeof input !== "object" || !("rfqStatus" in input) || typeof input.rfqStatus !== "string" || !isValidValue(RFQ_STATUSES, input.rfqStatus)) return Response.json({ ok: false, message: "Choose a valid RFQ status." }, { status: 400 });
      const source = "source" in input ? input.source : "rfq";
      if (source !== "rfq" && source !== "deal") return Response.json({ ok: false, message: "Choose a valid RFQ source." }, { status: 400 });
      const authStarted = performance.now();
      const denied = await deps.authorize(source);
      const authMs = Math.round(performance.now() - authStarted);
      if (denied) return Response.json(denied, { status: 403 });
      const { id } = await params;
      if (!id || id.length > 200) return Response.json({ ok: false, message: "Choose a valid item." }, { status: 400 });
      const saveStarted = performance.now();
      const saved = await deps.save(id, input.rfqStatus);
      const saveMs = Math.round(performance.now() - saveStarted);
      const snapshotStarted = performance.now();
      let workflow: RfqWorkflowSnapshot | null = null;
      // A failed read after a committed edit must never be reported as a failed save.
      try { workflow = await deps.snapshot(saved); } catch { /* A background refresh will recover the workflow display. */ }
      return Response.json({ ok: true, rfqStatus: saved.rfqStatus, workflow }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `rfq-save;dur=${Math.round(performance.now() - started)}, rfq-auth;dur=${authMs}, rfq-write;dur=${saveMs}, rfq-workflow;dur=${Math.round(performance.now() - snapshotStarted)}` } });
    } catch {
      return Response.json({ ok: false, message: "Could not confirm the save. Reload to check the saved status before trying again." }, { status: 503 });
    }
  };
}
