import { redirect } from "next/navigation";
export default async function EditOpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams({ step: "sales", ...(error ? { error } : {}) });
  redirect(`/records/${id}?${query}`);
}
