export default function DeliveriesLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-6 w-32 animate-pulse rounded bg-hover" />
        <div className="h-4 w-80 animate-pulse rounded bg-hover" />
      </div>

      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <div className="h-3 w-48 animate-pulse rounded bg-hover" />
          <div className="card overflow-hidden">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-full animate-pulse rounded bg-hover" />
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="card">
        <div className="h-4 w-44 animate-pulse rounded bg-hover" />
      </div>
    </div>
  );
}
