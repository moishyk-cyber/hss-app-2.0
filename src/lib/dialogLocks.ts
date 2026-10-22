/** Overlapping loading/form dialogs share leases so their handoff never unlocks or strands the page. */
const scrollLocks = new WeakMap<HTMLElement, { count: number; overflow: string }>();
const backgroundLocks = new WeakMap<HTMLElement, { count: number; inert: boolean }>();
export function lockDialogScroll(body: HTMLElement) {
  const lock = scrollLocks.get(body) ?? { count: 0, overflow: body.style.overflow };
  lock.count++;
  scrollLocks.set(body, lock);
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count === 0) { body.style.overflow = lock.overflow; scrollLocks.delete(body); }
  };
}
export function lockDialogBackground(elements: HTMLElement[]) {
  for (const element of elements) {
    const lock = backgroundLocks.get(element) ?? { count: 0, inert: element.inert };
    lock.count++;
    backgroundLocks.set(element, lock);
    element.inert = true;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const element of elements) {
      const lock = backgroundLocks.get(element)!;
      if (--lock.count === 0) { element.inert = lock.inert; backgroundLocks.delete(element); }
    }
  };
}
