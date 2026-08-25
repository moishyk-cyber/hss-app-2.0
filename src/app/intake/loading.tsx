// Skeleton for the intake form: header + the four numbered step cards.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 max-w-4xl">
        <div className="h-6 w-52 rounded bg-hover" />
        <div className="mt-2 h-3 w-full max-w-xl rounded bg-hover" />
      </div>

      <div className="max-w-4xl space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="card">
            <div className="flex items-start gap-3 border-b border-border px-6 py-5">
              <div className="h-8 w-8 shrink-0 rounded-full bg-hover" />
              <div className="flex-1">
                <div className="h-4 w-40 rounded bg-hover" />
                <div className="mt-2 h-3 w-72 rounded bg-hover" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2">
              <div className="h-14 rounded-[10px] bg-hover" />
              <div className="h-14 rounded-[10px] bg-hover" />
            </div>
          </section>
        ))}

        <div className="card flex items-center gap-4 px-6 py-5">
          <div className="h-8 w-32 rounded-lg bg-hover" />
          <div className="h-3 w-72 rounded bg-hover" />
        </div>
      </div>
    </div>
  );
}
