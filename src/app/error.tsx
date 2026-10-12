"use client";

// Route-level error boundary: a crash below the root layout renders THIS
// instead of the blank panel the Sep 2 QA round kept hitting. The sidebar
// stays up (this file only replaces the page area), so "broken" now reads as
// a labeled state with a retry - not a mystery.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card space-y-4 text-center">
        <h2 className="text-base font-semibold text-ink">This page hit an error</h2>
        <p className="text-[13px] text-gray-dark">
          Nothing you entered was lost elsewhere in the app. Try again - if it keeps happening,
          tell Klyne &amp; Co. and mention what you clicked.
          {error.digest ? (
            <span className="mt-1 block text-xs text-gray">Error reference: {error.digest}</span>
          ) : null}
        </p>
        <div className="flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/dashboard" className="btn">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
