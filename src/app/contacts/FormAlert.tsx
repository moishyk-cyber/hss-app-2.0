"use client";

import { useEffect, useRef } from "react";

/**
 * Validation banner that announces itself and takes focus on mount, so a
 * keyboard or screen-reader user lands on the reason the save was rejected
 * instead of having to hunt for it.
 */
export function FormAlert({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} role="alert" tabIndex={-1} className="banner-warn mb-5">
      {children}
    </div>
  );
}
