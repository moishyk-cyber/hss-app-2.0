import type { NotificationChange, NotificationSnapshot } from "./notificationLiveTypes";

type Dependencies = {
  snapshot: () => Promise<NotificationSnapshot>;
  counts: () => Promise<{ unread: number; total: number }>;
  subscribe: (listener: { change: (event: NotificationChange) => void; disconnect: () => void }) => Promise<() => void>;
  signal: AbortSignal;
  lifetimeMs?: number;
  heartbeatMs?: number;
  batchMs?: number;
};

/** Only database events cause reads after the initial snapshot. Heartbeats never query the database. */
export function notificationStream(deps: Dependencies): Response {
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false, initialized = false, flushing = false;
      let release: (() => void) | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let expiry: ReturnType<typeof setTimeout> | undefined;
      let batch: ReturnType<typeof setTimeout> | undefined;
      const pending = new Map<string, NotificationChange>();
      function send(event: string, data: unknown) {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat); clearTimeout(expiry); clearTimeout(batch);
        deps.signal.removeEventListener("abort", close);
        release?.();
        controller.close();
      }
      stop = close;
      async function flush() {
        batch = undefined;
        if (closed || !initialized || flushing || !pending.size) return;
        flushing = true;
        const changes = [...pending.values()]; pending.clear();
        try { send("notifications", { ...await deps.counts(), changes }); }
        catch { close(); }
        finally { flushing = false; if (pending.size && !closed) schedule(); }
      }
      function schedule() {
        if (!batch && initialized && !closed) batch = setTimeout(() => { void flush(); }, deps.batchMs ?? 150);
      }
      deps.signal.addEventListener("abort", close, { once: true });
      if (deps.signal.aborted) { close(); return; }
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      try {
        // Subscribe first so writes during the baseline read are buffered rather than missed.
        release = await deps.subscribe({ change(event) {
          if (closed) return;
          const previous = pending.get(event.notification.id);
          pending.set(event.notification.id, { ...event, operation: previous?.operation === "INSERT" ? "INSERT" : event.operation });
          schedule();
        }, disconnect: close });
        if (closed) { release(); return; }
        const snapshot = await deps.snapshot();
        if (closed) return;
        send("snapshot", snapshot);
        initialized = true;
        schedule();
        heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n")); }, deps.heartbeatMs ?? 20000);
        // Short lifetime works with bounded serverless requests and rechecks authentication on reconnect.
        expiry = setTimeout(close, deps.lifetimeMs ?? 240000);
      } catch { send("unavailable", { message: "Live notifications are reconnecting." }); close(); }
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
}
