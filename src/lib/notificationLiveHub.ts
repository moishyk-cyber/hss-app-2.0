import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { appMode } from "./environmentMode";
import { notificationChange, type NotificationChange } from "./notificationLiveTypes";

type Listener = { change: (event: NotificationChange) => void; disconnect: () => void };
type Subscription = { channel: RealtimeChannel; listeners: Set<Listener>; ready: Promise<void>; stop?: ReturnType<typeof setTimeout> };
type Hub = { client: SupabaseClient; subscriptions: Map<string, Subscription> };
const globalHub = globalThis as typeof globalThis & { notificationLiveHub?: Hub };

function hub(): Hub {
  if (globalHub.notificationLiveHub) return globalHub.notificationLiveHub;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Live notifications are not configured");
  return globalHub.notificationLiveHub = { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), subscriptions: new Map() };
}

/** Server-only shared socket. Never send this client or its credentials to a browser. */
export async function subscribeNotificationChanges(userId: string, listener: Listener): Promise<() => void> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(userId)) throw new Error("Invalid notification recipient");
  const instance = hub();
  const schema = appMode() === "dev" ? "testing" : "public";
  const topic = `${schema}:${userId}`;
  let subscription = instance.subscriptions.get(topic);
  if (!subscription) {
    const channel = instance.client.channel(`notification-feed:${topic}`);
    let resolve!: () => void, reject!: (error: Error) => void;
    const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    subscription = { channel, listeners: new Set(), ready };
    instance.subscriptions.set(topic, subscription);
    const current = subscription;
    const timeout = setTimeout(() => reject(new Error("Live notification connection timed out")), 12000);
    channel.on("postgres_changes", { event: "*", schema, table: "Notification", filter: `userId=eq.${userId}` }, payload => {
      const event = notificationChange(payload, userId);
      if (event) for (const target of current.listeners) target.change(event);
    }).subscribe(status => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timeout);
        reject(new Error("Live notification connection interrupted"));
        // Reconnection always establishes a fresh snapshot before resuming delivery.
        for (const target of [...current.listeners]) target.disconnect();
      }
    });
  }
  clearTimeout(subscription.stop);
  subscription.listeners.add(listener);
  const current = subscription;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    current.listeners.delete(listener);
    if (!current.listeners.size) current.stop = setTimeout(() => {
      if (!current.listeners.size && instance.subscriptions.get(topic) === current) {
        instance.subscriptions.delete(topic);
        void instance.client.removeChannel(current.channel);
      }
    }, 1000);
  };
  try { await current.ready; return release; }
  catch (error) { release(); throw error; }
}
