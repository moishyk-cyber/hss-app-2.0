"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/toast";

type Feed = { unread: number; latest: { id: string; title: string; createdAt: string; readAt: string | null }[] };
type NotificationContextValue = { unread: number | null; latestId: string | null; error: boolean; refresh: () => Promise<void>; sound: boolean; toggleSound: () => void };
const Context = createContext<NotificationContextValue | null>(null);
export const useNotifications = () => useContext(Context);

export function NotificationProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [unread, setUnread] = useState<number | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const soundOn = useRef(false);
  const known = useRef<Set<string> | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const { toast } = useToast();
  const play = useCallback(() => {
    const context = audio.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
    oscillator.start(); oscillator.stop(context.currentTime + 0.17);
  }, []);
  const toggleSound = useCallback(() => {
    const next = !soundOn.current;
    soundOn.current = next; setSound(next);
    if (next) {
      const unavailable = () => { soundOn.current = false; setSound(false); toast({ kind: "error", message: "Sound is unavailable in this browser. Visual notifications remain on." }); };
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().then(play).catch(unavailable);
      } catch { unavailable(); }
    }
  }, [play, toast]);
  const refresh = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/notifications", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error("Could not load notifications");
      const feed: Feed = await response.json();
      setUnread(feed.unread); setLatestId(feed.latest[0]?.id ?? null); setError(false);
      const fresh = known.current ? feed.latest.filter(item => !known.current!.has(item.id) && !item.readAt) : [];
      known.current ??= new Set();
      for (const item of feed.latest) known.current.add(item.id);
      if (fresh.length) {
        toast({ kind: "info", message: fresh.length === 1 ? fresh[0].title : "You have new notifications", actionLabel: "View", onAction: () => router.push("/notifications") });
        if (soundOn.current && document.visibilityState === "visible") play();
      }
    } catch { setError(true); }
    finally { inFlight.current = false; }
  }, [userId, toast, router, play]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refresh(); };
    update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("notifications:read", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); window.removeEventListener("notifications:read", update); };
  }, [refresh]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  return <Context.Provider value={{ unread, latestId, error, refresh, sound, toggleSound }}>{children}</Context.Provider>;
}

export function NotificationBadge() {
  const notifications = useNotifications();
  if (!notifications) return null;
  if (notifications.error) return <span className="ml-auto text-xs" title="Notifications unavailable. Open the inbox to retry." aria-label="Notifications unavailable">!</span>;
  return notifications.unread ? <span className="badge badge-red ml-auto" aria-label={`${notifications.unread} unread notifications`}>{notifications.unread > 99 ? "99+" : notifications.unread}</span> : null;
}
