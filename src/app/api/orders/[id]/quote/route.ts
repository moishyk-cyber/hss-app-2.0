export async function GET() { return Response.json({ ok: false, message: "Client quotes are now recorded on the deal before confirmation." }, { status: 410 }); }
export const POST = GET;
