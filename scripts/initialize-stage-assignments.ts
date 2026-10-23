import { PrismaClient } from "@prisma/client";
import { stageAssignee, STAGE_ASSIGNEE_KEYS } from "../src/lib/stageAssignments";
import { FLOW_STEPS } from "../src/lib/ballInCourt";
import { databaseConnectionUrl } from "../src/lib/environmentMode";
import { initializeStageAssignments } from "../src/lib/notifications";

const db = new PrismaClient({ datasourceUrl: databaseConnectionUrl() });
async function initialize() {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  for (const step of FLOW_STEPS) {
    if (step.key === "close") continue;
    const user = stageAssignee(step.key, null, users, {});
    if (!user) throw new Error(`No unambiguous active default assignee for ${step.label}. Configure it before rollout.`);
    const key = STAGE_ASSIGNEE_KEYS[step.key];
    await db.appSetting.upsert({ where: { key }, create: { key, value: user.id }, update: {} });
  }
  return initializeStageAssignments(db);
}
initialize()
  .then(result => console.log(`Baselined ${result.records} stage assignments without sending historical notifications.`))
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
