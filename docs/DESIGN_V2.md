# Design v2 — de-genericizing the UI

Trigger: "very inline view... the M-dash, the phone, the spacing is extremely AI
generic." Diagnosis confirmed in code: 27 raw `"—"` empty-value fallbacks, 14px
body / 10-13px paddings everywhere (no spacing scale), flat 1px-bordered boxes
with near-zero depth hierarchy, uniform pill-everything (badge/chip/btn all the
same rounded shape), tables with no breathing room. This is the generic
"enterprise SaaS template" look. Fixing the system (globals.css, done by Fable),
then every page applies it (agents).

## 1. Spacing scale (the #1 fix)

Real 4px-base scale, used deliberately instead of ad-hoc `px-2 py-1`:
`--sp-1:4px --sp-2:8px --sp-3:12px --sp-4:16px --sp-5:20px --sp-6:24px --sp-8:32px --sp-10:40px --sp-12:48px`

Rules:
- Card interior padding: **20px** minimum (was un-set, pages used 12-16px ad hoc). Stat cards/hero numbers: 24px.
- Page top-level vertical rhythm between sections: **32px** (was 24-32px inconsistent, often 16-24).
- Table cell padding: **14px 16px** (was 10px 12px — cramped).
- Gap between sidebar nav groups: 24px (was 16px).
- Line height for body text bumped to 1.55 (was default/tight).

## 2. Kill dash-itis

Never render a bare `—` as if it's content. Replace the pattern app-wide:
- Optional single-line fields with no value: render **nothing** (empty cell) rather than a dash — the label already tells you what's missing, in a table.
- Fields where absence is meaningful info (e.g. "no follow-up set", "unassigned"): a short **muted italic phrase** in `--gray`, e.g. *"not set"*, *"unassigned"* — never punctuation standing in for a sentence.
- Card/detail-view fields (not tables): omit the row entirely when empty, OR show the muted phrase — never `—`.
- Exception: numeric/currency cells may keep a thin dash *only* inside the table body where column alignment matters, styled `text-gray` at reduced opacity, never bold/dark.

## 3. Real depth & hierarchy (flat → layered)

- `.card` gets a two-tier shadow (ambient + key light), not a single flat 1px shadow — should read as "resting on the page," not "outlined."
- Hover-elevatable cards (list rows that link somewhere, kanban cards) lift on hover: shadow deepens + 1px translateY, transition 150ms.
- Section backgrounds vary: page background `--bg` (warm off-white), cards `--surface` (white), **new** `--surface-sunken` for nested/secondary content (PO cards inside order detail, subtasks) so nesting is visible without another border.
- Reduce border reliance: prefer shadow-for-elevation, border only where two adjacent same-color surfaces need a hard edge (tables).

## 4. Break pill monotony

Currently badges, chips, and buttons are ALL fully-rounded pills — everything looks the same shape regardless of function. New rule:
- **Badges** (status, read mostly): stay pill (fine — status chips are a real, recognizable pattern).
- **Buttons**: 10px radius (not full pill) — a button is an action, should read distinct from a status.
- **Chips (filters)**: keep pill (they're literally filter/tag UI, pill is correct there).
- **Cards**: 14px radius (slightly larger than the current 12px, softer).
- Stat tiles: introduce a subtle colored top accent bar (2px, using the metric's semantic color) instead of being visually identical gray boxes — gives the KPI row actual visual rhythm instead of 5 identical gray rectangles.

## 5. Typography

- Base body 14px → **14.5px** with 1.55 line-height (small change, real readability gain — was 1.4ish/default).
- `.page-title` 22px → **26px**, tighten letter-spacing slightly on Sora headings (-0.01em) — current title reads small/timid at the top of a page.
- `.section-label` gets a bit more breathing room below it (8px → 12px).
- Numerals in stat tiles / money use tabular-nums (already Sora, add `font-variant-numeric: tabular-nums`).

## 6. Phone Book specifically (named as bad)

Current: dense stacked business+contact rows inside one giant card, 5-column
contact grid crushed together, phone/email as tiny text links. Rework (Opus):
- Each business becomes its own **card** (not a section inside one mega-card) — restores the card grid rhythm the rest of the app has.
- Contact rows inside get real spacing (12px vertical rhythm, not packed grid), phone/email rendered with a small leading icon (inline SVG, currentColor — phone glyph, envelope glyph) instead of bare underlined text, so they read as actionable, not as spreadsheet cells.
- Empty phone/email: omit per the dash rule above.
- Business header row gets breathing room: type badge, priority star (if any), name, aggregate phone/email — spaced with the new scale, not crammed on one line.

## 7. Dashboard

Sonnet's chart rebuild is structurally right (KPI tiles + charts) — apply the
new stat-card top-accent-bar treatment and card padding/shadow, and give the
chart grid more gap (24px → 32px) so it doesn't read as a cramped spreadsheet
next to prose-dense tiles.

## Ownership

Fable: globals.css v2 (tokens, spacing scale, card/button/badge/table rewrites), layout.tsx spacing.
Opus: apply v2 across companies/contacts/intake/pipeline/phonebook — Phone Book gets the specific rework in §6, kill dash-itis in your files.
Sonnet: apply v2 across dashboard/rfq/orders/tasks — Dashboard gets §7 treatment, kill dash-itis in your files.
Both: re-check every table's cell padding, every card's interior padding, against the new scale — this is a sweep, not a spot-fix.
