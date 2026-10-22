import test from "node:test";
import assert from "node:assert/strict";
import { lockDialogScroll, lockDialogBackground } from "../src/lib/dialogLocks";
const element = (inert = false, overflow = "") => ({ inert, style: { overflow } }) as HTMLElement;
test("loading-to-form handoff keeps scrolling locked until both dialogs release", () => {
  const body = element(false, "auto");
  const loading = lockDialogScroll(body), form = lockDialogScroll(body);
  loading(); assert.equal(body.style.overflow, "hidden");
  form(); assert.equal(body.style.overflow, "auto");
});
test("nested dialogs may close in either order without stranding scroll lock", () => {
  const body = element(false, "scroll");
  const first = lockDialogScroll(body), second = lockDialogScroll(body);
  second(); assert.equal(body.style.overflow, "hidden");
  first(); assert.equal(body.style.overflow, "scroll");
});
test("background stays inert through handoff and restores each original value", () => {
  const active = element(), alreadyInert = element(true);
  const loading = lockDialogBackground([active, alreadyInert]);
  const form = lockDialogBackground([active, alreadyInert]);
  loading(); assert.equal(active.inert, true); assert.equal(alreadyInert.inert, true);
  form(); assert.equal(active.inert, false); assert.equal(alreadyInert.inert, true);
});
test("duplicate cleanup cannot unlock another dialog or break a future modal", () => {
  const body = element(), background = element();
  const firstScroll = lockDialogScroll(body), secondScroll = lockDialogScroll(body);
  const firstBackground = lockDialogBackground([background]), secondBackground = lockDialogBackground([background]);
  firstScroll(); firstScroll(); firstBackground(); firstBackground();
  assert.equal(body.style.overflow, "hidden"); assert.equal(background.inert, true);
  secondScroll(); secondBackground();
  const laterScroll = lockDialogScroll(body), laterBackground = lockDialogBackground([background]);
  laterScroll(); laterBackground();
  assert.equal(body.style.overflow, ""); assert.equal(background.inert, false);
});
