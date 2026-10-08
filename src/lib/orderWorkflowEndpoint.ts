import type { ActionResult } from "./actionResult";

type Dependencies = {
  authorize: (action: string) => Promise<ActionResult | null>;
  ownsTarget: (orderId: string, action: string, args: unknown[]) => Promise<boolean>;
  save: (action: string, args: unknown[]) => Promise<ActionResult>;
  snapshot: (orderId: string) => Promise<object>;
  actionNames: readonly string[];
};
/** Bounded JSON saves run outside an RSC refresh; uncertain outcomes are explicit. */
export function createOrderWorkflowEndpoint(deps: Dependencies) {
  return async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, message: "Reload the page before saving." }, { status: 403 });
    try {
      let input: unknown;
      try { input = await request.json(); }
      catch { return Response.json({ ok: false, message: "Invalid workflow change." }, { status: 400 }); }
      if (!input || typeof input !== "object" || !("action" in input) || !("args" in input) || typeof input.action !== "string" || !deps.actionNames.includes(input.action) || !Array.isArray(input.args) || typeof input.args[0] !== "string" || JSON.stringify(input).length > 20000) return Response.json({ ok: false, message: "Invalid workflow change." }, { status: 400 });
      const denied = await deps.authorize(input.action);
      if (denied) return Response.json(denied, { status: 403 });
      const { id } = await params;
      if (!await deps.ownsTarget(id, input.action, input.args)) return Response.json({ ok: false, message: "Choose an item belonging to this order." }, { status: 400 });
      const result = await deps.save(input.action, input.args);
      if (!result.ok) return Response.json(result, { status: 400 });
      return Response.json({ ok: true, ...await deps.snapshot(id) }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ ok: false, message: "Could not confirm the save. Reload to check the saved state before trying again." }, { status: 503 });
    }
  };
}
