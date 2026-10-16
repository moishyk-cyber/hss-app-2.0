import { notFound } from "next/navigation";
import { BackLink } from "@/lib/BackLink";
import { PageHeader } from "@/lib/PageLayout";
import { can } from "@/lib/permissionsServer";
import { PartnerForm } from "../PartnerForm";
export const dynamic = "force-dynamic";
export default async function NewPartnerPage({ searchParams }: { searchParams: Promise<{ kind?: string; name?: string; deliveryId?: string }> }) {
  if (!(await can("deliveries.edit"))) notFound();
  const { kind, name, deliveryId } = await searchParams;
  const initialKind = kind === "carriers" || kind === "truckers" ? kind : "";
  return <div>
    <div className="mb-3"><BackLink href="/carriers-truckers" label="Back to Carriers & Truckers" /></div>
    <PageHeader title="New carrier or trucker" subtitle="Choose the type and enter the name." />
    <PartnerForm initialKind={initialKind} initialName={(name ?? "").slice(0, 200)} deliveryId={deliveryId} />
  </div>;
}
