export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-6 w-36 animate-pulse rounded bg-hover" />
        <div className="h-4 w-96 animate-pulse rounded bg-hover" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-hover" />
            <div className="h-7 w-12 animate-pulse rounded bg-hover" />
            <div className="h-3 w-16 animate-pulse rounded bg-hover" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="h-4 w-56 animate-pulse rounded bg-hover" />
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card h-14 w-full animate-pulse bg-hover" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-hover" />
            <div className="card space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="h-5 w-full animate-pulse rounded bg-hover" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-hover" />
        <div className="card space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, row) => (
            <div key={row} className="h-4 w-full animate-pulse rounded bg-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}
