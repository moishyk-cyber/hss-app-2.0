import { SERIES_1 } from "./colors";

// Vertical time-series bar chart. Horizontal gridlines only (recessive, var(--border)).
// Rounded corners on the data end only (top, bars grow up from the baseline).
// Selective direct labels: peak + latest bar only, not every point.
export function VerticalBarChart({
  data,
  formatValue = (v: number) => String(v),
  color = SERIES_1,
  ariaLabel = "Bar chart",
}: {
  data: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  color?: string;
  ariaLabel?: string;
}) {
  const width = 400;
  const height = 180;
  const padTop = 22;
  const padBottom = 26;
  const padX = 6;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const n = Math.max(1, data.length);
  const bandW = plotW / n;
  const barW = Math.max(2, Math.min(24, bandW * 0.4));
  const max = Math.max(1, ...data.map((d) => d.value));

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => padTop + plotH - (i / gridCount) * plotH);

  let peakIdx = 0;
  data.forEach((d, i) => {
    if (d.value > (data[peakIdx]?.value ?? -Infinity)) peakIdx = i;
  });
  const latestIdx = data.length - 1;
  const tickStep = Math.max(1, Math.ceil(data.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={ariaLabel}>
      {gridLines.map((y, i) => (
        <line key={i} x1={padX} x2={width - padX} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const x = padX + i * bandW + (bandW - barW) / 2;
        const barH = Math.max(0, (d.value / max) * plotH);
        const y = padTop + plotH - barH;
        const showLabel = data.length > 0 && (i === peakIdx || i === latestIdx);
        const showTick = (i % tickStep === 0 && latestIdx - i >= Math.ceil(tickStep / 2)) || i === latestIdx;
        return (
          <g key={i}>
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            {barH > 0 && (
              <>
                <rect x={x} y={y} width={barW} height={barH} rx={4} ry={4} fill={color} />
                {barH > 4 && <rect x={x} y={y + barH - 4} width={barW} height={4} fill={color} />}
              </>
            )}
            {showLabel && (
              <text
                x={x + barW / 2}
                y={Math.max(10, y - 5)}
                textAnchor="middle"
                className="fill-ink text-[12px] font-medium"
              >
                {formatValue(d.value)}
              </text>
            )}
            {showTick && (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="fill-gray text-[11px]">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
