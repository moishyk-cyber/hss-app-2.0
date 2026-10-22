import type { ActionResult } from "./actionResult";
import { hasSameOrigin } from "./requestOrigin";
import { ClientQuoteValidationError, clientQuoteInputProblem, type ClientQuoteInput } from "./workflows/clientQuote";
type Quote = { clientQuoteCreated: boolean; clientQuoteSent: boolean; clientQuoteUrl: string | null };
export function createClientQuoteEndpoint(deps: {
  authorize: () => Promise<ActionResult | null>;
  read: (id: string) => Promise<Quote | null>;
  save: (id: string, input: ClientQuoteInput) => Promise<Quote>;
}) {
  type Context = { params: Promise<{ id: string }> };
  return {
    async GET(_request: Request, { params }: Context) {
      try {
        const denied = await deps.authorize(); if (denied) return Response.json(denied, { status: 403 });
        const quote = await deps.read((await params).id);
        return Response.json(quote ? { ok: true, quote } : { ok: false, message: "Deal not found." }, { status: quote ? 200 : 404, headers: { "Cache-Control": "no-store" } });
      } catch { return Response.json({ ok: false, message: "Could not check the saved client quote." }, { status: 503 }); }
    },
    async POST(request: Request, { params }: Context) {
      if (!hasSameOrigin(request)) return Response.json({ ok: false, message: "Reload the page before saving." }, { status: 403 });
      try {
        const denied = await deps.authorize(); if (denied) return Response.json(denied, { status: 403 });
        let input: unknown; try { input = await request.json(); } catch { return Response.json({ ok: false, message: "Invalid quote details." }, { status: 400 }); }
        if (!input || typeof input !== "object" || !("created" in input) || !("sent" in input) || !("url" in input)) return Response.json({ ok: false, message: "Enter valid client quote details." }, { status: 400 });
        const problem = clientQuoteInputProblem(input as ClientQuoteInput);
        if (problem) return Response.json({ ok: false, message: problem }, { status: 400 });
        const quote = await deps.save((await params).id, input as ClientQuoteInput);
        return Response.json({ ok: true, quote }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) { if (error instanceof ClientQuoteValidationError) return Response.json({ ok: false, message: error.message }, { status: 400 }); return Response.json({ ok: false, message: "Could not confirm the save. Reload to check the saved client quote before trying again." }, { status: 503 }); }
    },
  };
}
