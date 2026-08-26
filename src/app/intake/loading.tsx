// Skeleton for the intake screen: header + two-column who/items layout + outcome bar.
function PanelSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <section className="card">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-3 w-24 rounded bg-hover" />
        <div className="h-8 w-36 rounded-[10px] bg-hover" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: rows * 2 }).map((_, i) => (
          <div key={i}>
            <div className="mb-2 h-2.5 w-20 rounded bg-hover" />
            <div className="h-9 rounded-[9px] bg-hover" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-36 rounded bg-hover" />
          <div className="mt-2 h-3 w-96 max-w-full rounded bg-hover" />
        </div>
        <div className="h-8 w-28 rounded-lg bg-hover" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={1} />
        </div>
        <div className="space-y-6">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={1} />
        </div>
      </div>

      <div className="card mt-6 flex items-center justify-between gap-4">
        <div className="h-3 w-56 rounded bg-hover" />
        <div className="h-8 w-40 rounded-lg bg-hover" />
      </div>
    </div>
  );
}
