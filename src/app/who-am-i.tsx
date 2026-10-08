"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logout } from "./login/actions";

/** Sidebar identity display + sign-out, now that /login is the real identity gate. */
export default function WhoAmI({ name }: { name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="sidebar-identity">
      <span className="identity-avatar" aria-hidden>
        {name
          .split(" ")
          .map((word) => word[0])
          .slice(0, 2)
          .join("")}
      </span>
      <span className="identity-name" title={name}>
        {name}
      </span>
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
  );
}
