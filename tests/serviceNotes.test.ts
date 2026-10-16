import test from "node:test";
import assert from "node:assert/strict";
import { addServiceNote, SERVICE_NOTE_ACTION } from "../src/lib/workflows/serviceNotes";
import { memoryDatabase, fixture } from "./memoryDatabase";

function notesFixture() {
  return { ...fixture(), activityLog: [], serviceIssue: [
    { id: "issue", orderId: "order", companyId: "company", status: "open", resolution: "Original resolution" },
    { id: "other", orderId: null, companyId: null, status: "resolved" },
  ] };
}
const author = { id: "user", name: "Original author" };

test("service updates retain note, author snapshot and server date on their own issue", async () => {
  const m = memoryDatabase(notesFixture());
  const { note } = await addServiceNote(m.db, "issue", "  Called supplier.\nAwaiting replacement.  ", author);
  assert.equal(note.action, SERVICE_NOTE_ACTION);
  assert.equal(note.linkedType, "service_issue");
  assert.equal(note.linkedId, "issue");
  assert.equal(note.detail, "Called supplier.\nAwaiting replacement.");
  assert.equal(note.userId, "user");
  assert.equal(note.userName, "Original author");
  assert.ok(note.at instanceof Date);
  await addServiceNote(m.db, "other", "Separate update", { ...author, name: "Renamed author" });
  assert.equal(m.state().activityLog[0].userName, "Original author");
  assert.equal(m.state().serviceIssue[0].status, "open");
  assert.equal(m.state().serviceIssue[0].resolution, "Original resolution");
});

test("blank, oversized and unauthored notes cannot be written", async () => {
  const m = memoryDatabase(notesFixture());
  for (const body of ["", "   ", "a".repeat(4001)]) await assert.rejects(addServiceNote(m.db, "issue", body, author));
  await assert.rejects(addServiceNote(m.db, "issue", "Update", { id: "", name: "" }));
  assert.equal(m.state().activityLog.length, 0);
});

test("a missing issue or database failure never reports a successful note save", async () => {
  const m = memoryDatabase(notesFixture());
  await assert.rejects(addServiceNote(m.db, "missing", "Update", author), /not found/);
  m.fail("activityLog.create");
  await assert.rejects(addServiceNote(m.db, "issue", "Retry this update", author), /Injected/);
  assert.equal(m.state().activityLog.length, 0);
});
