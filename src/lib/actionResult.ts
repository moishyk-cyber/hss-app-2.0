// Shared result shape for server actions invoked from buttons/selects (as opposed to
// redirecting form submissions, which report failure via a `?error=` query param instead).

export type ActionResult = { ok: true } | { ok: false; message: string };

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

/** Runs a mutation, turning a thrown error into a friendly ActionResult instead of crashing. */
export async function safeAction(
  fn: () => Promise<void>,
  failMessage: string = DEFAULT_MESSAGE
): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, message: failMessage };
  }
}
