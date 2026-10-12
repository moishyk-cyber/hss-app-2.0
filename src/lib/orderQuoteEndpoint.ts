import type { ActionResult } from "./actionResult";

type Context = { params: Promise<{ id: string }> };
type Quote = { quoteStatus: string; quoteUrl: string | null; quoteSentAt: Date | null };
type Dependencies = {
  authorize: () => Promise<ActionResult | null>;
  read: (id: string) => Promise<Quote | null>;
  save: (id: string, input: { quoteStatus: string; quoteUrl: string }) => Promise<ActionResult>;
};
export function createOrderQuoteEndpoint({ authorize, read, save }: Dependencies) {
  async function quoteResponse(id: string) {
    const quote = await read(id);
    return quote ? Response.json({ ok: true, quote }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ ok: false, message: "Order not found." }, { status: 404 });
  }
  return {
    async GET(_request: Request, { params }: Context) {
      try {
        const denied = await authorize();
        if (denied && !denied.ok) return Response.json(denied, { status: 403 });
        return await quoteResponse((await params).id);
      } catch { return Response.json({ ok: false, message: "Could not check the saved quote status. Try again." }, { status: 503 }); }
    },
    async POST(request: Request, { params }: Context) {
      if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, message: "Reload the page before saving." }, { status: 403 });
      try {
        const denied = await authorize();
        if (denied && !denied.ok) return Response.json(denied, { status: 403 });
        let input: unknown;
        try { input = await request.json(); }
        catch { return Response.json({ ok: false, message: "Invalid quote details." }, { status: 400 }); }
        if (!input || typeof input !== "object" || !("quoteStatus" in input) || !("quoteUrl" in input) || typeof input.quoteStatus !== "string" || typeof input.quoteUrl !== "string" || input.quoteUrl.length > 4000) return Response.json({ ok: false, message: "Enter valid quote details." }, { status: 400 });
        const { id } = await params;
        const result = await save(id, { quoteStatus: input.quoteStatus, quoteUrl: input.quoteUrl });
        if (!result.ok) return Response.json(result, { status: 400 });
        // This response only waits for the saved quote, never a page render.
        return await quoteResponse(id);
      } catch { return Response.json({ ok: false, message: "The change may have saved. Check the saved status before trying again." }, { status: 503 }); }
    },
  };
}
