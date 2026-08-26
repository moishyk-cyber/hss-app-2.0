import { SERIES_1 } from "./colors";

// Horizontal bar chart: one bar per category, value labels to the right.
// Rounded corners on the data end only (right, since bars grow rightward
// from the axis on the left) — anchored/square on the axis side.
export function HorizontalBarChart({
  data,
  formatValue = (v: number) => String(v),
  color = SERIES_1,
}: {
  data: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  color?: string;
}) {
  const rowH = 30;
  const barH = Math.round(rowH * 0.6);
  const labelW = 148;
  const trackW = 300;
  const valueW = 72;
  const width = labelW + trackW + valueW;
  const height = data.length * rowH + 6;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const y = i * rowH + 3;
        const barLen = Math.max(0, (d.value / max) * trackW);
        const x0 = labelW;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            <text
              x={labelW - 8}
              y={y + barH / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-gray-dark text-[11px]"
            >
              {d.label}
            </text>
            {barLen > 0 && (
              <>
                <rect x={x0} y={y} width={barLen} height={barH} rx={4} ry={4} fill={color} />
                {barLen > 4 && <rect x={x0} y={y} width={4} height={barH} fill={color} />}
              </>
            )}
            <text
              x={x0 + barLen + 6}
              y={y + barH / 2}
              dominantBaseline="middle"
              className="fill-ink text-[11px] font-medium"
            >
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
