// FlowStepper — shows where a record sits in the end-to-end journey, and (per the
// Aug 31 feedback round) doubles as the control for moving it: a step can carry an
// href (jump to a tab/section) or a bound server action (move the stage directly).
// Server-renderable (no client JS — actions render as <form> buttons).
// See docs/UX_FLOW.md §3B.

import Link from "next/link";

export type FlowStep = {
  label: string;
  /** Short action or status hint shown under the current step, e.g. "Record deposit" */
  hint?: string;
  state: "done" | "current" | "upcoming" | "blocked";
  /** Clicking the step navigates here (tab anchors, detail pages). */
  href?: string;
  /** Clicking the step submits this bound server action (e.g. move deal to this stage). */
  formAction?: (formData: FormData) => Promise<void>;
};

/** Dot marker — checked when done, filled when current. No numbers (feedback: cleaner). */
function StepDot({ state }: { state: FlowStep["state"] }) {
  return (
    <span
      className={
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " +
        (state === "done"
          ? "bg-green text-white"
          : state === "current"
          ? "bg-primary text-white ring-4 ring-[rgba(28,28,30,0.12)]"
          : state === "blocked"
          ? "bg-orange-soft text-orange border border-orange"
          : "bg-hover text-gray")
      }
      aria-hidden
    >
      {state === "done" ? "✓" : state === "blocked" ? "!" : ""}
    </span>
  );
}

function StepBody({ step }: { step: FlowStep }) {
  return (
    <>
      <span
        className={
          "mt-1.5 text-[12px] leading-tight px-1 truncate max-w-full " +
          (step.state === "current"
            ? "font-bold text-ink"
            : step.state === "done"
            ? "font-semibold text-gray-dark"
            : "font-medium text-gray")
        }
      >
        {step.label}
      </span>
      {step.state === "current" && step.hint && (
        <span className="mt-0.5 text-[10.5px] font-semibold text-primary px-1 truncate max-w-full">
          {step.hint}
        </span>
      )}
    </>
  );
}

export function FlowStepper({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="flex items-start gap-0 overflow-x-auto py-1" aria-label="Progress">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const clickable = Boolean(step.href || step.formAction);
        const column = (
          <div
            className={
              "flex flex-col items-center text-center min-w-0 w-full rounded-lg py-1 transition-colors " +
              (clickable ? "cursor-pointer hover:bg-hover" : "")
            }
          >
            <div className="flex items-center w-full">
              <div
                className={`h-px flex-1 ${i === 0 ? "opacity-0" : ""} ${
                  step.state === "upcoming" ? "bg-border" : "bg-green"
                }`}
              />
              <StepDot state={step.state} />
              <div
                className={`h-px flex-1 ${isLast ? "opacity-0" : ""} ${
                  step.state === "done" ? "bg-green" : "bg-border"
                }`}
              />
            </div>
            <StepBody step={step} />
          </div>
        );

        return (
          <li key={step.label} className="flex items-start min-w-0 flex-1">
            {step.formAction ? (
              <form action={step.formAction} className="w-full min-w-0">
                <button type="submit" className="block w-full min-w-0">
                  {column}
                </button>
              </form>
            ) : step.href ? (
              <Link href={step.href} className="block w-full min-w-0">
                {column}
              </Link>
            ) : (
              column
            )}
          </li>
        );
      })}
    </ol>
  );
}
