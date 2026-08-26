// Skeleton for the pipeline kanban: header + stage columns of deal cards.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-44 rounded bg-hover" />
          <div className="mt-2 h-3 w-56 rounded bg-hover" />
        </div>
        <div className="h-8 w-28 rounded-lg bg-hover" />
      </div>

      <div className="flex gap-3 overflow-hidden pb-4">
        {Array.from({ length: 6 }).map((_, col) => (
          <div key={col} className="card flex w-72 shrink-0 flex-col">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="h-3 w-28 rounded bg-hover" />
              <div className="h-6 w-8 rounded-full bg-hover" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: col % 2 === 0 ? 3 : 1 }).map((_, i) => (
                <div key={i} className="card-sunken">
                  <div className="h-3.5 w-full rounded bg-hover" />
                  <div className="mt-2 h-3 w-24 rounded bg-hover" />
                  <div className="mt-3 flex items-center justify-between">
                    <div className="h-3 w-16 rounded bg-hover" />
                    <div className="h-3 w-14 rounded bg-hover" />
                  </div>
                  <div className="mt-3 h-7 w-full rounded-lg bg-hover" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
