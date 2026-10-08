export default function EditDealLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading edit deal form">
      <div className="h-4 w-36 animate-pulse rounded bg-hover" />
      <div className="h-8 w-64 max-w-full animate-pulse rounded bg-hover" />
      <div className="card max-w-4xl space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-hover" />
          ))}
        </div>
        <div className="h-24 animate-pulse rounded bg-hover" />
        <span className="sr-only">Loading edit deal form…</span>
      </div>
    </div>
  );
}
