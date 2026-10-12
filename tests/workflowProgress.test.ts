import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCompletedStep } from "../src/lib/workflowProgress";
import type { JourneyStep } from "../src/lib/dealWorkflow";
const step = (key: string, state: JourneyStep["state"]): JourneyStep => ({ key, state, label: key, owner: "Sales", description: "", completion: "", checks: [] });
test("completing selected terms advances past resolved payment to purchasing", () => {
  const before = [step("terms", "to_do"), step("deposit", "complete"), step("pos", "to_do")];
  const after = [step("terms", "complete"), ...before.slice(1)];
  assert.equal(nextCompletedStep(before, after, "terms"), "pos");
});
test("sent quote waits for approval; editing completed steps does not jump", () => {
  assert.equal(nextCompletedStep([step("quote", "to_do")], [step("quote", "waiting")], "quote"), null);
  assert.equal(nextCompletedStep([step("terms", "complete")], [step("terms", "complete"), step("pos", "to_do")], "terms"), null);
});
test("skipping optional quote advances to terms", () => {
  assert.equal(nextCompletedStep([step("quote", "to_do"), step("terms", "to_do")], [step("terms", "to_do")], "quote"), "terms");
});
test("completing another step never interrupts selected work", () => {
  const before = [step("terms", "to_do"), step("deposit", "waiting")];
  assert.equal(nextCompletedStep(before, [step("terms", "complete"), before[1]], "deposit"), null);
});
test("final completion returns to the timeline with closeout selected", () => {
  assert.equal(nextCompletedStep([step("service", "to_do")], [step("service", "complete")], "service"), "service");
});
