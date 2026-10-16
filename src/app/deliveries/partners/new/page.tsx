import { redirect } from "next/navigation";
export default async function LegacyNewPartner({ searchParams }: { searchParams: Promise<Record<string, string>> }) { const params = await searchParams; redirect(`/carriers-truckers/new?${new URLSearchParams(params)}`); }
