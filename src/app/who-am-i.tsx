"use client";

import { useEffect, useSyncExternalStore } from "react";
import { readStoredUserId, storeUserId, ensureCookieMirror } from "@/lib/identityClient";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getSnapshot() {
  return readStoredUserId();
}
function getServerSnapshot(): string | null {
  return null; // the server has no localStorage
}

/**
 * Sidebar identity picker — stands in for auth. Whoever is picked here is who
 * the activity log credits (via the cookie mirror in identityClient).
 */
export default function WhoAmI({ users }: { users: { id: string; name: string }[] }) {
  const userId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Identities picked before the cookie mirror existed need re-mirroring once.
    ensureCookieMirror();
  }, []);

  return (
    <div className="px-6 pb-4">
      <label
        htmlFor="who-am-i"
        className="block pb-1 font-heading text-[10px] font-semibold uppercase tracking-[0.08em] text-gray"
      >
        Working as
      </label>
      <select
        id="who-am-i"
        value={userId ?? ""}
        onChange={(e) => storeUserId(e.target.value)}
        className="w-full rounded-[8px] border border-border bg-panel px-3 py-2 text-[13px] text-ink"
      >
        <option value="" disabled>
          Pick your name…
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
