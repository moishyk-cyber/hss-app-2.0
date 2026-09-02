export default function OpportunityDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-36 animate-pulse rounded bg-hover" />
      <div className="h-8 w-80 animate-pulse rounded bg-hover" />
      <div className="card h-24 animate-pulse" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="card h-72 animate-pulse" />
          <div className="card h-52 animate-pulse" />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <div className="card h-64 animate-pulse" />
          <div className="card h-56 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
