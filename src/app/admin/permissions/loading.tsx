export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-9 w-64 animate-pulse rounded bg-hover" />
      <div className="card card-flush overflow-hidden">
        <div className="space-y-3 p-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}
