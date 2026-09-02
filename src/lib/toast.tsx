"use client";

// App-wide toast notifications - the "it worked" / "it didn't" layer every
// mutation can talk through (Sep 2 QA: several writes either succeeded or
// failed with nothing on screen either way). Success toasts confirm writes
// that would otherwise be silent; toasts with an action ("Undo") make
// one-click mutations reversible without a blocking dialog.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

type ToastKind = "success" | "error" | "info";

export type ToastInput = {
  message: string;
  kind?: ToastKind;
  /** Label for the optional action button, e.g. "Undo". */
  actionLabel?: string;
  /** Runs when the action button is clicked; the toast dismisses itself. */
  onAction?: () => void | Promise<unknown>;
  /** ms before auto-dismiss. Defaults to 4s, or 7s when there's an action to consider. */
  duration?: number;
};

type ToastRecord = ToastInput & { id: number };

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(null);

/** Safe no-op outside the provider so shared components can call it unconditionally. */
export function useToast(): { toast: (t: ToastInput) => void } {
  return useContext(ToastContext) ?? { toast: () => {} };
}

const KIND_DOT: Record<ToastKind, string> = {
  success: "bg-green",
  error: "bg-red",
  info: "bg-gray",
};

// Hydration-safe "am I on the client yet" flag (no setState-in-effect).
const noopSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const mounted = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      // At most 3 on screen - older ones make way.
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      const duration = input.duration ?? (input.onAction ? 7000 : 4000);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted && toasts.length > 0
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4"
            >
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className="card pointer-events-auto flex w-full items-center gap-3 !py-3 shadow-[var(--shadow-card-hover)]"
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[t.kind ?? "info"]}`}
                  />
                  <span className="min-w-0 flex-1 text-[13px] text-ink">{t.message}</span>
                  {t.actionLabel && t.onAction ? (
                    <button
                      type="button"
                      className="btn btn-sm shrink-0"
                      onClick={() => {
                        dismiss(t.id);
                        void t.onAction?.();
                      }}
                    >
                      {t.actionLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => dismiss(t.id)}
                    className="shrink-0 rounded px-1 text-gray transition-colors hover:text-ink"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}
