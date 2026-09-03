export default function ServiceLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-hover" />
        <div className="h-4 w-80 animate-pulse rounded bg-hover" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-hover" />
            <div className="h-7 w-10 animate-pulse rounded bg-hover" />
          </div>
        ))}
      </div>

      <div className="h-10 w-40 animate-pulse rounded-lg bg-hover" />

      <div className="flex gap-2">
        <div className="h-7 w-32 animate-pulse rounded bg-hover" />
        <div className="h-7 w-32 animate-pulse rounded bg-hover" />
      </div>

      <div className="card overflow-hidden p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="h-10 w-full animate-pulse rounded bg-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}
