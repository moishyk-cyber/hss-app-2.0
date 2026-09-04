// Client-side pre-auth identity ("Working as" in the sidebar).
// The chosen user id lives in localStorage (the original mechanism) and is
// mirrored into a cookie so Server Actions can attribute activity-log entries.
// Replace with a real session when auth lands.

const IDENTITY_KEY = "hss.salespersonId";
const IDENTITY_COOKIE = "hss_user_id";

export function readStoredUserId(): string | null {
  try {
    return window.localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null; // private mode / storage disabled
  }
}

export function storeUserId(id: string) {
  if (!id) return;
  try {
    window.localStorage.setItem(IDENTITY_KEY, id);
    document.cookie = `${IDENTITY_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
    // The native "storage" event only fires in OTHER tabs - dispatch one here so
    // same-tab useSyncExternalStore subscribers update too.
    window.dispatchEvent(new StorageEvent("storage", { key: IDENTITY_KEY, newValue: id }));
  } catch {
    // ignore
  }
}

/** Identities picked before the cookie mirror existed need re-mirroring once. */
export function ensureCookieMirror() {
  try {
    const id = readStoredUserId();
    if (id && !document.cookie.includes(`${IDENTITY_COOKIE}=`)) storeUserId(id);
  } catch {
    // ignore
  }
}
