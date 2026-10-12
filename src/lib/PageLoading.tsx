export function CollectionLoading() {
  return (
    <div className="space-y-6" aria-label="Loading records" role="status">
      <div className="page-header">
        <div className="space-y-2">
          <div className="h-7 w-48 max-w-full animate-pulse rounded bg-hover" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-hover" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded bg-hover" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-72 max-w-full animate-pulse rounded bg-hover" />
        <div className="h-8 w-20 animate-pulse rounded bg-hover" />
      </div>
      <div className="table-scroll p-3 space-y-2">
        <div className="h-9 animate-pulse rounded bg-hover" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-hover" />
        ))}
      </div>
      <span className="sr-only">Loading records…</span>
    </div>
  );
}
export function DetailLoading() {
  return (
    <div className="space-y-6" aria-label="Loading record" role="status">
      <div className="h-8 w-32 animate-pulse rounded bg-hover" />
      <div className="h-8 w-64 max-w-full animate-pulse rounded bg-hover" />
      <div className="card space-y-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded bg-hover" />
        ))}
      </div>
      <span className="sr-only">Loading record…</span>
    </div>
  );
}
