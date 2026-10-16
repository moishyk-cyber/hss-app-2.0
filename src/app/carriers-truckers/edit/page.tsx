import { notFound } from "next/navigation";
import { can } from "@/lib/permissionsServer";
import { getDeliveryPartners } from "@/lib/deliveryPartnerData";
import { BackLink } from "@/lib/BackLink";
import { PageHeader } from "@/lib/PageLayout";
import { PartnerForm } from "../PartnerForm";
export const dynamic = "force-dynamic";
export default async function EditPartnerPage({ searchParams }: { searchParams: Promise<{ kind?: string; name?: string }> }) {
  if (!(await can("deliveries.edit"))) notFound();
  const { kind, name } = await searchParams;
  if ((kind !== "carriers" && kind !== "truckers") || !name) notFound();
  const partners = await getDeliveryPartners();
  const existing = partners[kind].find(value => value.toLowerCase() === name.toLowerCase());
  if (!existing) notFound();
  return <div>
    <div className="mb-3"><BackLink href="/carriers-truckers" label="Back to Carriers & Truckers" /></div>
    <PageHeader title={`Edit ${kind === "carriers" ? "carrier" : "trucker"}`} subtitle="Changes update the shared list and its delivery references." />
    <PartnerForm initialKind={kind} initialName={existing} originalName={existing} />
  </div>;
}
