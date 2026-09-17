"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logout } from "./login/actions";

/** Sidebar identity display + sign-out, now that /login is the real identity gate. */
export default function WhoAmI({ name }: { name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-6 pb-4">
      <span className="block pb-1 font-heading text-[10px] font-semibold uppercase tracking-[0.08em] text-gray">
        Signed in as
      </span>
      <div className="flex items-center justify-between gap-2 rounded-[8px] border border-border bg-panel px-3 py-2">
        <span className="truncate text-[13px] text-ink">{name}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await logout();
              router.push("/login");
              router.refresh();
            })
          }
          className={`shrink-0 text-xs text-primary transition-colors hover:underline ${pending ? "opacity-60" : ""}`}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
