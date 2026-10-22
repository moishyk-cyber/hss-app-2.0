/** Share overlapping identical reads, without retaining completed data. Never use for writes. */
const inFlight = new Map<string, Promise<unknown>>();
export function shareRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = Promise.resolve().then(read);
  inFlight.set(key, pending);
  const clear = () => { if (inFlight.get(key) === pending) inFlight.delete(key); };
  void pending.then(clear, clear);
  return pending;
}
/** A committed change must not join a read that started before that change. */
export function invalidateSharedReads() { inFlight.clear(); }
