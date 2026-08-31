// BackLink - the ONE back-navigation control, used at the top of every detail and
// form page (Aug 31 feedback: friendlier, and identical everywhere). Server-renderable.

import Link from "next/link";

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-panel py-1.5 pl-2 pr-3 text-[12.5px] font-medium text-gray-dark transition-colors hover:bg-hover hover:text-ink"
    >
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}
