"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/** Find the target inside this record, including when it is rendered in a drawer. */
export function highlightSection(hash: string, source?: Element | null) {
  const root = source?.closest(".pipeline-detail") ?? document;
  const target = root.querySelector<HTMLElement>(`#${CSS.escape(hash.replace(/^#/, ""))}`) ?? (hash.startsWith("#deal-") ? root.querySelector<HTMLElement>("#deal-summary") : null);
  if (!target) return false;
  const panel = target.closest<HTMLElement>("[data-workflow-steps]");
  if (panel) {
    const keys = panel.dataset.workflowSteps!.split(",");
    const destinations: Record<string, string> = { "#order-terms": "terms", "#payments": "deposit", "#quote-status": "quote", "#purchase-orders": "pos", "#delivery": "delivery", "#service": "service", "#order-complete": "service", "#order-intake": "sales", "#order-summary": "close" };
    const preferred = destinations[hash] ?? (hash === "#line-items" || hash.startsWith("#pricing-") ? "pricing" : keys[0]);
    panel.dispatchEvent(new CustomEvent("workflow:reveal", { bubbles: true, detail: { keys, preferred } }));
  }
  const details = target.closest("details");
  if (details) details.open = true;
  let attempts = 0;
  const attend = () => {
    if (!target.getClientRects().length && attempts++ < 10) { requestAnimationFrame(attend); return; }
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    target.classList.remove("section-highlight");
    target.classList.add("section-highlight");
    const control = target.matches("input,select,textarea,button") ? target :
      target.querySelector<HTMLElement>('input[inputmode="decimal"]:not(:disabled)') ??
      Array.from(target.querySelectorAll<HTMLElement>("input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)")).find(element => element.getClientRects().length > 0);
    control?.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove("section-highlight"), 2600);
  }
  requestAnimationFrame(attend);
  return true;
}

export function SectionLink({ href, onClick, fullPage = false, ...props }: ComponentProps<typeof Link> & { fullPage?: boolean }) {
  // Record-to-record workflow navigation leaves intercepted sidebar routes.
  if (fullPage && typeof href === "string" && !href.startsWith("#")) return <a {...props} href={href} onClick={onClick} />;
  return <Link {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof href === "string" && href.startsWith("#") && highlightSection(href, event.currentTarget)) event.preventDefault();
  }} />;
}
