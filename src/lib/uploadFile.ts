import { uploadProblem } from "./uploadPolicy";

type Result = { ok: true } | { ok: false; message: string };
type Signed = { uploadUrl: string; storagePath: string };
export type UploadAttempt = { file: File; signed: Signed; uploaded: boolean };

/** Only metadata reaches server actions; bytes go directly to private storage.
 * Retain the attempt so a failed Document save can retry without uploading twice.
 */
export async function uploadFile(
  file: File,
  attempt: { current: UploadAttempt | null },
  operations: {
    start: () => Promise<(Signed & { ok: true }) | { ok: false; message: string }>;
    finish: (signed: Signed) => Promise<Result>;
    fetch?: typeof fetch;
  },
): Promise<Result> {
  const problem = uploadProblem(file);
  if (problem) return { ok: false, message: problem };
  try {
    if (attempt.current?.file !== file) {
      const signed = await operations.start();
      if (!signed.ok) return signed;
      attempt.current = { file, signed, uploaded: false };
    }
    const pending = attempt.current;
    if (!pending.uploaded) {
      let response: Response;
      try {
        response = await (operations.fetch ?? fetch)(pending.signed.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type, "cache-control": "max-age=3600", "x-upsert": "false" },
          body: file,
        });
      } catch {
        attempt.current = null;
        return { ok: false, message: "The upload could not reach storage. Check your connection and try again." };
      }
      if (!response.ok) {
        attempt.current = null;
        return { ok: false, message: "Storage rejected the upload. Please try again, or paste a link instead." };
      }
      pending.uploaded = true;
    }
    const result = await operations.finish(pending.signed);
    if (result.ok) attempt.current = null;
    return result;
  } catch {
    return { ok: false, message: "Could not save that upload. Check your connection and try again." };
  }
}
