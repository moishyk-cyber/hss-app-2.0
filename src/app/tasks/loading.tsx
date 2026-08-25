export default function TasksLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-6 w-24 animate-pulse rounded bg-hover" />
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

      <div className="flex justify-end gap-2">
        <div className="h-7 w-20 animate-pulse rounded-full bg-hover" />
        <div className="h-7 w-20 animate-pulse rounded-full bg-hover" />
      </div>

      {Array.from({ length: 4 }).map((_, section) => (
        <div key={section} className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-hover" />
          <div className="card overflow-hidden p-4">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="h-8 w-full animate-pulse rounded bg-hover" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
