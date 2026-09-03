import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card space-y-4 text-center">
        <h2 className="text-base font-semibold text-ink">That record isn&rsquo;t here</h2>
        <p className="text-[13px] text-gray-dark">
          The link may be stale, or the record was removed. Nothing else is affected.
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary">
            Go to Dashboard
          </Link>
          <Link href="/pipeline" className="btn">
            Open Pipeline
          </Link>
        </div>
      </div>
    </div>
  );
}
