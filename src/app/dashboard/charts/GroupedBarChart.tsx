import { SERIES_1, SERIES_2 } from "./colors";

// The ONE two-series chart in the dashboard — grouped (not stacked) bars,
// with a legend row (single-series charts get no legend; this one needs it).
export function GroupedBarChart({
  data,
  seriesLabels,
  formatValue = (v: number) => String(v),
}: {
  data: { label: string; a: number; b: number }[];
  seriesLabels: [string, string];
  formatValue?: (v: number) => string;
}) {
  const width = 560;
  const height = 220;
  const padTop = 22;
  const padBottom = 26;
  const padX = 6;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const n = Math.max(1, data.length);
  const bandW = plotW / n;
  const groupW = bandW * 0.6;
  const barW = Math.max(2, (groupW - 2) / 2);
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => padTop + plotH - (i / gridCount) * plotH);
  const tickStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5 text-gray-dark">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_1 }} aria-hidden />
          {seriesLabels[0]}
        </span>
        <span className="flex items-center gap-1.5 text-gray-dark">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_2 }} aria-hidden />
          {seriesLabels[1]}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Grouped bar chart">
        {gridLines.map((y, i) => (
          <line key={i} x1={padX} x2={width - padX} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const groupX = padX + i * bandW + (bandW - groupW) / 2;
          const aH = Math.max(0, (d.a / max) * plotH);
          const bH = Math.max(0, (d.b / max) * plotH);
          const ay = padTop + plotH - aH;
          const by = padTop + plotH - bH;
          const bx = groupX + barW + 2;
          const showTick = i % tickStep === 0 || i === data.length - 1;
          return (
            <g key={i}>
              <title>{`${d.label} — ${seriesLabels[0]}: ${formatValue(d.a)}, ${seriesLabels[1]}: ${formatValue(d.b)}`}</title>
              {aH > 0 && (
                <>
                  <rect x={groupX} y={ay} width={barW} height={aH} rx={4} ry={4} fill={SERIES_1} />
                  {aH > 4 && <rect x={groupX} y={ay + aH - 4} width={barW} height={4} fill={SERIES_1} />}
                </>
              )}
              {bH > 0 && (
                <>
                  <rect x={bx} y={by} width={barW} height={bH} rx={4} ry={4} fill={SERIES_2} />
                  {bH > 4 && <rect x={bx} y={by + bH - 4} width={barW} height={4} fill={SERIES_2} />}
                </>
              )}
              {showTick && (
                <text x={groupX + barW + 1} y={height - 8} textAnchor="middle" className="fill-gray text-[9.5px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
