// Initial avatar, Google-Contacts style - the app-wide recognition aid.
// Always a circle (Moishy's call, Aug 31: mixed circle/square shapes read as
// inconsistent in one list). Colour derives from the name so a record keeps
// the same one on every render and every page. `kind` is accepted so call
// sites don't churn, but no longer changes the shape.

export function Avatar({
  name,
  kind: _kind,
  size = "md",
}: {
  name: string;
  kind?: "business" | "person";
  size?: "sm" | "md";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const dims = size === "sm" ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-[13px]";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dims}`}
      style={{ backgroundColor: `hsl(${hash} 42% 45%)` }}
    >
      {initial}
    </span>
  );
}
