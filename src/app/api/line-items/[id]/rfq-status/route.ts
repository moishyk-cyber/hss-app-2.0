import { createRfqStatusEndpoint } from "@/lib/rfqStatusEndpoint";
import { authorizePermission, type CurrentUser } from "@/lib/permissionsServer";
import { createLineItemPricing } from "@/lib/workflows/pricing";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { activityLoggerFor } from "@/lib/log";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let actor: CurrentUser | null = null;
  return createRfqStatusEndpoint({
    authorize: async source => {
      const result = await authorizePermission(source === "deal" ? "deals.edit" : "pricing.edit");
      actor = result.user;
      return result.denied;
    },
    save: async (id, status) => {
      if (!actor) throw new Error("Missing authorized actor");
      const audit = activityLoggerFor(actor);
      const pricing = createLineItemPricing(prisma, { audit, refresh: revalidatePath });
      const { item, quoteProgress } = await pricing.setStatus(id, status);
      await audit("line_item", id, "rfq_status_set", `RFQ status set to ${status}`);
      return { rfqStatus: item.rfqStatus, opportunityId: item.opportunityId, orderId: item.orderId, quoteProgress };
    },
    snapshot: async saved => {
      if (!saved.opportunityId || saved.orderId || !saved.quoteProgress) return null;
      return { opportunityId: saved.opportunityId, quoteProgress: saved.quoteProgress };
    },
  })(request, context);
}
