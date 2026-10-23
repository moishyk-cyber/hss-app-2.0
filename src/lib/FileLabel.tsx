'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Ellipsis in constrained layouts, with the full label in a floating hover panel. */
export function FileLabel({ text, className = '', focusable = true, detail }: { text: string; className?: string; focusable?: boolean; detail?: string | null }) {
  const label = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  function keepOpen() { if (closeTimer.current) clearTimeout(closeTimer.current); }
  function closeSoon() { keepOpen(); closeTimer.current = setTimeout(() => setPosition(null), 120); }
  function open() {
    keepOpen();
    const element = label.current;
    if (!element || (element.scrollWidth <= element.clientWidth && !detail)) return;
    const rect = element.getBoundingClientRect();
    const above = rect.bottom > window.innerHeight - 180;
    setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(360, window.innerWidth - 24) - 12)), above });
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey, true); };
  }, [position]);
  return <><span ref={label} tabIndex={focusable ? 0 : undefined} className={`file-label ${className}`} onMouseEnter={open} onMouseLeave={closeSoon} onFocus={open} onBlur={closeSoon} aria-describedby={position ? id : undefined}>{text}</span>{position && createPortal(<span id={id} role="tooltip" className="file-label-popup" style={{ top: position.top, left: position.left, transform: position.above ? 'translateY(-100%)' : undefined }} onMouseEnter={keepOpen} onMouseLeave={closeSoon}>{text}{detail && detail !== text && <span className="mt-1 block text-gray-dark">{detail}</span>}</span>, document.body)}</>;
}
