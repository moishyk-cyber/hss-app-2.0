// FlowStepper — shows where a record sits in the end-to-end journey.
// Server-renderable (no client JS). See docs/UX_FLOW.md §3B.

export type FlowStep = {
  label: string;
  /** Short action or status hint shown under the current step, e.g. "Record deposit" */
  hint?: string;
  state: "done" | "current" | "upcoming" | "blocked";
};

export function FlowStepper({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="flex items-start gap-0 overflow-x-auto py-1" aria-label="Progress">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={step.label} className="flex items-start min-w-0 flex-1">
            <div className="flex flex-col items-center text-center min-w-0 flex-1">
              <div className="flex items-center w-full">
                <div
                  className={`h-px flex-1 ${i === 0 ? "opacity-0" : ""} ${
                    step.state === "upcoming" ? "bg-border" : "bg-green"
                  }`}
                />
                <span
                  className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                    (step.state === "done"
                      ? "bg-green text-white"
                      : step.state === "current"
                      ? "bg-primary text-white ring-4 ring-[rgba(28,28,30,0.12)]"
                      : step.state === "blocked"
                      ? "bg-orange-soft text-orange border border-orange"
                      : "bg-hover text-gray")
                  }
                  aria-hidden
                >
                  {step.state === "done" ? "✓" : i + 1}
                </span>
                <div
                  className={`h-px flex-1 ${isLast ? "opacity-0" : ""} ${
                    step.state === "done" ? "bg-green" : "bg-border"
                  }`}
                />
              </div>
              <span
                className={
                  "mt-1.5 text-[11px] leading-tight px-1 truncate max-w-full " +
                  (step.state === "current"
                    ? "font-semibold text-ink"
                    : step.state === "done"
                    ? "text-gray-dark"
                    : "text-gray")
                }
              >
                {step.label}
              </span>
              {step.state === "current" && step.hint && (
                <span className="mt-0.5 text-[10.5px] font-medium text-primary px-1 truncate max-w-full">
                  {step.hint}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
