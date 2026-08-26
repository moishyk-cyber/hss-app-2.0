// Skeleton for the companies list: header, search, chips, table.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-40 rounded bg-hover" />
          <div className="mt-2 h-3 w-24 rounded bg-hover" />
        </div>
        <div className="h-8 w-32 rounded-lg bg-hover" />
      </div>

      <div className="mb-4 h-9 w-64 rounded-lg bg-hover" />

      <div className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-6 w-20 rounded-full bg-hover" />
        ))}
      </div>

      <div className="card card-flush overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="h-3 w-full max-w-2xl rounded bg-hover" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="h-3.5 flex-1 rounded bg-hover" />
            <div className="h-5 w-20 rounded-full bg-hover" />
            <div className="h-3.5 w-24 rounded bg-hover" />
            <div className="h-3.5 w-28 rounded bg-hover" />
            <div className="h-3.5 w-40 rounded bg-hover" />
          </div>
        ))}
      </div>
    </div>
  );
}
