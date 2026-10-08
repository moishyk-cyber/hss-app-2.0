import { saveDealIntake } from "@/app/pipeline/actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, message: "Reload before saving." }, { status: 403 });
  try {
    const { id } = await params;
    const data = await request.formData();
    data.set("id", id);
    // The action owns field validation and deals.edit authorization.
    const result = await saveDealIntake(data);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, message: "Could not confirm the save. Reload to check the saved details before trying again." }, { status: 503 }); }
}
