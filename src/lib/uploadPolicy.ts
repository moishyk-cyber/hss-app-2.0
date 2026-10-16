/** Shared by file pickers and server-side attachment validation. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const UPLOAD_ACCEPT = "application/pdf,image/*";

export function uploadProblem(file: { name: string; type: string; size: number }, maxBytes = MAX_UPLOAD_BYTES): string | null {
  if (!file.name.trim()) return "That file has no name.";
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) return "Only PDFs and images can be uploaded.";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "That file looks empty or has an invalid size.";
  if (file.size > maxBytes) return "That file is over the 25 MB limit.";
  return null;
}
