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

        <div className="dashboard-metrics">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="stat-card space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-hover" />
              <div className="h-7 w-16 animate-pulse rounded bg-hover" />
            </div>
          ))}
        </div>

        <div className="dashboard-charts">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card dashboard-chart space-y-3">
              <div className="h-3 w-40 animate-pulse rounded bg-hover" />
              <div className="h-40 w-full animate-pulse rounded bg-hover" />
            </div>
          ))}
        </div>


      </div>
    </div>
  );
}
