import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordPath } from "@/lib/recordPath";
export const dynamic = "force-dynamic";
export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ workflow?: string; step?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true, opportunityId: true } });
  if (!order) notFound();
  const search = new URLSearchParams();
  if (query.workflow) search.set("workflow", query.workflow);
  if (query.step) search.set("step", query.step);
  redirect(recordPath(order.id, order.opportunityId) + (search.size ? `?${search}` : ""));
}
