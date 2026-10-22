import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissionsServer";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { createClientQuoteEndpoint } from "@/lib/clientQuoteEndpoint";
import { saveClientQuote } from "@/lib/workflows/clientQuote";
import { logActivity } from "@/lib/log";

const endpoint = createClientQuoteEndpoint({
  authorize: () => requirePermission("deals.edit"),
  read: id => prisma.opportunity.findUnique({ where: { id }, select: { clientQuoteCreated: true, clientQuoteSent: true, clientQuoteUrl: true } }),
  save: async (id, input) => {
    const required = await getFieldRequirements();
    const quote = await saveClientQuote(prisma, id, input, { company: required["opportunity.companyId"], neededBy: required["opportunity.neededByDate"] });
    await logActivity("opportunity", id, "client_quote_updated", input.sent ? "Client quote created and sent" : input.created ? "Client quote created" : "Client quote confirmation cleared");
    for (const path of [`/pipeline/${id}`, "/pipeline", "/dashboard", "/notifications"]) revalidatePath(path);
    return quote;
  },
});
export const GET = endpoint.GET;
export const POST = endpoint.POST;
