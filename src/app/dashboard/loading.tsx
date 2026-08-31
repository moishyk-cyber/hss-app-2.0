export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-36 animate-pulse rounded bg-hover" />
        <div className="h-4 w-60 animate-pulse rounded bg-hover" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-border pb-2.5">
        <div className="h-4 w-20 animate-pulse rounded bg-hover" />
        <div className="h-4 w-20 animate-pulse rounded bg-hover" />
      </div>

      <div className="space-y-8">
        {/* Range control: dropdown + two date inputs */}
        <div className="flex flex-wrap items-end gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-12 animate-pulse rounded bg-hover" />
              <div className="h-9 w-36 animate-pulse rounded bg-hover" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="stat-card space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-hover" />
              <div className="h-7 w-16 animate-pulse rounded bg-hover" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="h-3 w-40 animate-pulse rounded bg-hover" />
              <div className="h-40 w-full animate-pulse rounded bg-hover" />
            </div>
          ))}
        </div>

        <div className="card space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-hover" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-hover" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
