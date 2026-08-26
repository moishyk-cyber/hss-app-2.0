// Skeleton for the phone book: header, search, chips, then a grid of business cards.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="h-7 w-48 rounded bg-hover" />
          <div className="mt-2 h-3 w-72 rounded bg-hover" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-[10px] bg-hover" />
          <div className="h-9 w-28 rounded-[10px] bg-hover" />
        </div>
      </div>

      <div className="mb-5 h-9 w-80 rounded-[9px] bg-hover" />

      <div className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-hover" />
        ))}
      </div>

      <div className="mb-5 h-3 w-40 rounded bg-hover" />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, biz) => (
          <section key={biz} className="card">
            <div className="border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-48 rounded bg-hover" />
                <div className="h-6 w-20 rounded-full bg-hover" />
              </div>
              <div className="mt-3 flex gap-5">
                <div className="h-3.5 w-32 rounded bg-hover" />
                <div className="h-3.5 w-40 rounded bg-hover" />
              </div>
            </div>
            {Array.from({ length: biz % 2 === 0 ? 2 : 1 }).map((_, i) => (
              <div key={i} className="border-b border-border py-3.5 first:pt-4 last:border-b-0 last:pb-0">
                <div className="h-3.5 w-36 rounded bg-hover" />
                <div className="mt-2 flex gap-5">
                  <div className="h-3.5 w-28 rounded bg-hover" />
                  <div className="h-3.5 w-28 rounded bg-hover" />
                  <div className="h-3.5 w-40 rounded bg-hover" />
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
