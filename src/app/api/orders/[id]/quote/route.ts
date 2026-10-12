import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissionsServer";
import { setOrderQuote } from "@/app/orders/actions";
import { createOrderQuoteEndpoint } from "@/lib/orderQuoteEndpoint";

const endpoint = createOrderQuoteEndpoint({
  authorize: () => requirePermission("quotes.edit"),
  read: id => prisma.order.findUnique({ where: { id }, select: { quoteStatus: true, quoteUrl: true, quoteSentAt: true } }),
  save: setOrderQuote,
});
export const GET = endpoint.GET;
export const POST = endpoint.POST;
