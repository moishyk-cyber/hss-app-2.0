import { SERIES_1 } from "./colors";

// Horizontal bar chart: one bar per category, value labels to the right.
// Rounded corners on the data end only (right, since bars grow rightward
// from the axis on the left) - anchored/square on the axis side.
export function HorizontalBarChart({
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
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="dashboard-bars" role="img" aria-label={ariaLabel}>
      {data.map((d) => (
        <div className="dashboard-bar-row" key={d.label}>
          <span className="dashboard-bar-label">{d.label}</span>
          <span className="dashboard-bar-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, d.value / max) * 100}%`, background: color }} />
          </span>
          <span className="dashboard-bar-value">{formatValue(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
