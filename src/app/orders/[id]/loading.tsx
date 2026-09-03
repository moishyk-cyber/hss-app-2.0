export default function OrderDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="h-4 w-32 animate-pulse rounded bg-hover" />
      <div className="card space-y-4">
        <div className="h-7 w-72 animate-pulse rounded bg-hover" />
        <div className="h-4 w-48 animate-pulse rounded bg-hover" />
        <div className="h-10 w-full animate-pulse rounded bg-hover" />
        <div className="h-16 w-full animate-pulse rounded bg-hover" />
      </div>
      <div className="card space-y-4">
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-28 animate-pulse rounded bg-hover" />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-full animate-pulse rounded bg-hover" />
        ))}
      </div>
    </div>
  );
}
