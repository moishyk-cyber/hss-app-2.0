"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/lib/toast";

import type { LiveNotification, NotificationSnapshot, NotificationUpdate } from "@/lib/notificationLiveTypes";
import { notificationArrivals } from "@/lib/notificationLiveTypes";
import { NotificationPopups } from "./NotificationPopups";

type LiveState = { unread: number; total: number; records: LiveNotification[]; readThrough: string | null };
type NotificationContextValue = { unread: number | null; latestId: string | null; error: boolean; refresh: () => Promise<void>; sound: boolean; toggleSound: () => void; live: LiveState | null; markRead: (id?: string) => void };
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
  const [live, setLive] = useState<LiveState | null>(null);
  const [popups, setPopups] = useState<LiveNotification[]>([]);
  const connect = useRef<(() => void) | null>(null);
  const newest = useRef<LiveNotification | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
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
  const dismiss = useCallback((id: string) => {
    setPopups(items => items.filter(item => item.id !== id));
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
  }, []);
  const apply = useCallback((values: NotificationSnapshot | NotificationUpdate, initial: boolean) => {
    const rows = "latest" in values ? values.latest : values.changes.map(change => change.notification);
    const candidates = "changes" in values ? values.changes.filter(change => change.operation === "INSERT").map(change => change.notification) : rows;
    const fresh = notificationArrivals(known.current, candidates, initial);
    known.current ??= new Set();
    for (const item of rows) { known.current.add(item.id); if (item.readAt) dismiss(item.id); }
    // Keep enough IDs to absorb reconnect overlap without retaining an unbounded history.
    while (known.current.size > 2000) known.current.delete(known.current.values().next().value!);
    setUnread(values.unread); setError(false);
    const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const latest = sorted[0];
    if (latest && (!newest.current || latest.createdAt > newest.current.createdAt || (latest.createdAt === newest.current.createdAt && latest.id > newest.current.id))) {
      newest.current = latest; setLatestId(latest.id);
    }
    setLive(previous => {
      const records = new Map(previous?.records.map(item => [item.id, item]) ?? []);
      for (const item of rows) records.set(item.id, item);
      if (values.unread === 0) for (const [id, item] of records) records.set(id, { ...item, readAt: item.readAt ?? newest.current?.createdAt ?? item.createdAt });
      return { unread: values.unread, total: values.total, records: [...records.values()].slice(-2000), readThrough: values.unread === 0 ? newest.current?.createdAt ?? previous?.readThrough ?? null : previous?.readThrough ?? null };
    });
    if (fresh.length) {
      const shown = fresh.slice(-3);
      setPopups(previous => [...previous.filter(item => !shown.some(next => next.id === item.id)), ...shown].slice(-3));
      for (const item of shown) {
        clearTimeout(timers.current.get(item.id));
        timers.current.set(item.id, setTimeout(() => dismiss(item.id), 12000));
      }
      if (soundOn.current && document.visibilityState === "visible") play();
    }
  }, [dismiss, play]);
  const refresh = useCallback(async () => { connect.current?.(); }, []);
  const markRead = useCallback((id?: string) => {
    setLive(previous => previous ? { ...previous, records: previous.records.map(item => !id || item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item), ...(!id ? { unread: 0, readThrough: newest.current?.createdAt ?? previous.readThrough } : {}) } : previous);
    if (!id) { setUnread(0); setPopups([]); } else dismiss(id);
    // The database event supplies the authoritative count, including reads from other tabs.
  }, [dismiss]);
  useEffect(() => {
    if (!userId) return;
    let source: EventSource | undefined;
    const open = () => {
      source?.close();
      source = new EventSource("/api/notifications/stream");
      source.addEventListener("snapshot", event => { try { apply(JSON.parse((event as MessageEvent).data) as NotificationSnapshot, true); } catch { setError(true); } });
      source.addEventListener("notifications", event => { try { apply(JSON.parse((event as MessageEvent).data) as NotificationUpdate, false); } catch { setError(true); } });
      source.addEventListener("unavailable", () => setError(true));
      source.onerror = () => setError(true);
      // Native EventSource reconnects automatically; each reconnection gets a catch-up snapshot.
    };
    connect.current = open;
    open();
    const online = () => open();
    window.addEventListener("online", online);
    return () => { source?.close(); connect.current = null; window.removeEventListener("online", online); };
  }, [userId, apply]);
  useEffect(() => {
    const pending = timers.current;
    return () => { for (const timer of pending.values()) clearTimeout(timer); void audio.current?.close(); };
  }, []);
  return <Context.Provider value={{ unread, latestId, error, refresh, sound, toggleSound, live, markRead }}>{children}<NotificationPopups items={popups} dismiss={dismiss} pause={id => { clearTimeout(timers.current.get(id)); timers.current.delete(id); }} /></Context.Provider>;
}

export function NotificationBadge() {
  const notifications = useNotifications();
  if (!notifications) return null;
  if (notifications.error) return <span className="ml-auto text-xs" title="Live notifications reconnecting. Open the inbox to retry." aria-label="Live notifications reconnecting">!</span>;
  return notifications.unread ? <span className="badge badge-red ml-auto" aria-label={`${notifications.unread} unread notifications`}>{notifications.unread > 99 ? "99+" : notifications.unread}</span> : null;
}
