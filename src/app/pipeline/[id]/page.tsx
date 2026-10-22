import { redirect } from "next/navigation";
import { recordPath } from "@/lib/recordPath";
export default async function LegacyPipelineRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; workflow?: string; step?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  redirect(recordPath(id) + (search.size ? `?${search}` : ""));
}
