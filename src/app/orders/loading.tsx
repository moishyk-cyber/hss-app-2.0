export default function OrdersLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-6 w-28 animate-pulse rounded bg-hover" />
        <div className="h-4 w-72 animate-pulse rounded bg-hover" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-hover" />
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded bg-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}
