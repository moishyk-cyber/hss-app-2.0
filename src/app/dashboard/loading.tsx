export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-36 animate-pulse rounded bg-hover" />
        <div className="h-4 w-96 animate-pulse rounded bg-hover" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-40 animate-pulse rounded-full bg-hover" />
        ))}
      </div>

      <div className="card space-y-2 p-4">
        <div className="h-3 w-32 animate-pulse rounded bg-hover" />
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="h-8 w-full animate-pulse rounded bg-hover" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card space-y-2 p-4">
            <div className="h-3 w-40 animate-pulse rounded bg-hover" />
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="h-6 w-full animate-pulse rounded bg-hover" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
