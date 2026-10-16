import test from "node:test";
import assert from "node:assert/strict";
import { deleteTeamMember } from "../src/lib/workflows/userDeletion";
import { memoryDatabase } from "./memoryDatabase";

function seed() {
  return {
    user: [
      { id: "owner", name: "Owner", email: "owner@example.com", role: "admin", active: true },
      { id: "admin", name: "Admin", email: "admin@example.com", role: "admin", active: true },
      { id: "departing", name: "Former teammate", email: "former@example.com", role: "sales", active: false },
    ],
    appSetting: [
      { id: "owner-setting", key: "account.ownerId", value: "owner" },
      { id: "service-setting", key: "service.defaultAssigneeId", value: "departing" },
      { id: "pricing-setting", key: "pricing.defaultAssigneeId", value: "departing" },
      { id: "court-setting", key: "court.sales.userIds", value: "departing,admin" },
    ],
    opportunity: [{ id: "deal", salespersonId: "departing", stage: "won" }],
    order: [{ id: "order", ownerId: "departing", status: "complete" }],
    task: [{ id: "task", assigneeId: "departing", status: "done" }],
    lineItem: [{ id: "item", assigneeId: "departing", rfqStatus: "approved" }],
    serviceIssue: [{ id: "issue", assigneeId: "departing", status: "resolved" }],
    taskComment: [
      { id: "comment", authorId: "departing", authorName: null, body: "Keep this comment" },
      { id: "named-comment", authorId: "departing", authorName: "Original name", body: "Keep original attribution" },
    ],
    activityLog: [{ id: "history", userId: "departing", userName: null, detail: "Keep this history" }],
  };
}

test("only active admins can delete; self, owner and missing accounts remain protected", async () => {
  for (const [target, actor, message] of [
    ["departing", null, /signed-in admin/],
    ["departing", "departing", /signed-in admin/],
    ["admin", "admin", /own account/],
    ["owner", "admin", /owner cannot be deleted/],
    ["missing", "admin", /not found/],
  ] as const) {
    const m = memoryDatabase(seed());
    const result = await deleteTeamMember(m.db, target, actor);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, message);
    assert.equal(m.state().user.length, 3);
    assert.equal(m.state().activityLog.length, 1);
  }
});

test("deletion stays disabled until an owner is designated", async () => {
  const data = seed();
  data.appSetting = [];
  const m = memoryDatabase(data);
  const result = await deleteTeamMember(m.db, "departing", "admin");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /Choose an account owner/);
  assert.equal(m.state().user.length, 3);
});

test("open work in any queue blocks deletion, including for inactive users", async () => {
  for (const [model, field, value] of [
    ["opportunity", "stage", "estimating"], ["order", "status", "new"],
    ["task", "status", "in_progress"], ["lineItem", "rfqStatus", "needs_pricing"],
    ["serviceIssue", "status", "open"],
  ] as const) {
    const data = seed();
    Object.assign(data[model][0], { [field]: value });
    const m = memoryDatabase(data);
    const result = await deleteTeamMember(m.db, "departing", "admin");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /1 open item/);
    assert.equal(m.state().user.length, 3);
    assert.equal(m.state().taskComment[0].authorId, "departing");
  }
});

test("deletion preserves business records, comments and audit names and cleans settings", async () => {
  const m = memoryDatabase(seed());
  assert.deepEqual(await deleteTeamMember(m.db, "departing", "admin"), { ok: true });
  assert.equal(m.state().user.some(u => u.id === "departing"), false);
  for (const [model, field] of [["opportunity", "salespersonId"], ["order", "ownerId"], ["task", "assigneeId"], ["lineItem", "assigneeId"], ["serviceIssue", "assigneeId"]]) {
    assert.equal(m.state()[model].length, 1);
    assert.equal(m.state()[model][0][field], null);
  }
  assert.equal(m.state().taskComment[0].body, "Keep this comment");
  assert.equal(m.state().taskComment[0].authorId, null);
  assert.equal(m.state().taskComment[0].authorName, "Former teammate");
  assert.equal(m.state().taskComment[1].authorName, "Original name");
  assert.equal(m.state().activityLog[0].userName, "Former teammate");
  assert.equal(m.state().activityLog[0].userId, null);
  assert.equal(m.state().activityLog[1].action, "user_deleted");
  assert.equal(m.state().activityLog[1].userId, "admin");
  assert.equal(m.state().appSetting.some(s => s.key === "service.defaultAssigneeId"), false);
  assert.equal(m.state().appSetting.some(s => s.key === "pricing.defaultAssigneeId"), false);
  assert.equal(m.state().appSetting.find(s => s.key === "court.sales.userIds")?.value, "admin");
  assert.equal(m.state().appSetting.find(s => s.key === "account.ownerId")?.value, "owner");
});

test("a failed delete or audit write rolls back all changes", async () => {
  for (const failure of ["user.delete", "activityLog.create"]) {
    const m = memoryDatabase(seed());
    m.fail(failure);
    await assert.rejects(deleteTeamMember(m.db, "departing", "admin"));
    assert.equal(m.state().user.length, 3);
    assert.equal(m.state().taskComment[0].authorId, "departing");
    assert.equal(m.state().taskComment[0].authorName, null);
    assert.equal(m.state().appSetting.length, 4);
    assert.equal(m.state().activityLog.length, 1);
  }
});

test("serialization retries remove the account and publish its audit exactly once", async () => {
  const m = memoryDatabase(seed());
  m.conflictOnce();
  assert.deepEqual(await deleteTeamMember(m.db, "departing", "admin"), { ok: true });
  assert.deepEqual(m.isolation, ["Serializable", "Serializable"]);
  assert.equal(m.state().activityLog.filter(log => log.action === "user_deleted").length, 1);
});
