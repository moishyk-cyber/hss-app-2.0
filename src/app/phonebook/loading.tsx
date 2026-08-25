// Skeleton for the phone book: header, search, chips, grouped business/contact rows.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-40 rounded bg-hover" />
          <div className="mt-2 h-3 w-72 rounded bg-hover" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-28 rounded-lg bg-hover" />
          <div className="h-8 w-28 rounded-lg bg-hover" />
        </div>
      </div>

      <div className="mb-4 h-9 w-80 rounded-lg bg-hover" />

      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-6 w-20 rounded-full bg-hover" />
        ))}
      </div>

      <div className="mb-4 h-3 w-40 rounded bg-hover" />

      <div className="card overflow-hidden">
        {Array.from({ length: 6 }).map((_, biz) => (
          <div key={biz} className="border-b border-border last:border-b-0">
            <div className="flex items-center gap-3 bg-panel px-4 py-3">
              <div className="h-4 w-44 rounded bg-hover" />
              <div className="h-5 w-20 rounded-full bg-hover" />
              <div className="ml-auto h-3 w-56 rounded bg-hover" />
            </div>
            {Array.from({ length: biz % 2 === 0 ? 2 : 1 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="h-3.5 w-36 rounded bg-hover" />
                <div className="h-3.5 w-20 rounded bg-hover" />
                <div className="h-3.5 w-28 rounded bg-hover" />
                <div className="h-3.5 w-28 rounded bg-hover" />
                <div className="h-3.5 flex-1 rounded bg-hover" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
