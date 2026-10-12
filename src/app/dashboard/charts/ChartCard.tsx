// Shared chart chrome: title + the chart itself + a <details> accessibility
// fallback table (spec §"every chart gets a View data table"). Server component.

export function ChartCard({
  title,
  description,
  hasData,
  children,
  tableHead,
  tableRows,
  emptyText = "No data yet.",
}: {
  title: string;
  description?: string;
  hasData: boolean;
  children: React.ReactNode;
  tableHead: string[];
  tableRows: (string | number)[][];
  emptyText?: string;
}) {
  return (
    <div className="card dashboard-chart">
      <div className="dashboard-chart-heading">
        <h3>{title}</h3>
        {description && <span>{description}</span>}
      </div>
      {!hasData ? (
        <div className="py-8 text-center text-sm text-gray">{emptyText}</div>
      ) : (
        <>
          {children}
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-gray-dark transition-colors hover:text-ink">
              View data
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="table-klyne">
                <thead>
                  <tr>
                    {tableHead.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
