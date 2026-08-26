export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-9 w-32 animate-pulse rounded bg-hover" />
      <div className="card card-flush overflow-hidden">
        <div className="space-y-3 p-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-hover" />
          ))}
        </div>
      </div>
    </div>
  );
}
