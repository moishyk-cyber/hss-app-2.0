export default function RfqLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded bg-hover" />
        <div className="h-4 w-96 animate-pulse rounded bg-hover" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-32 animate-pulse rounded-full bg-hover" />
        ))}
      </div>

      {[0, 1, 2, 3].map((section) => (
        <div key={section} className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-hover" />
          <div className="card overflow-hidden p-4">
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-8 w-full animate-pulse rounded bg-hover" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
