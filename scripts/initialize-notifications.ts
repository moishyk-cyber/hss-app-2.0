import { databaseConnectionUrl } from "../src/lib/environmentMode";
import { PrismaClient } from "@prisma/client";
import { initializeNotifications } from "../src/lib/notifications";

const db = new PrismaClient({ datasourceUrl: databaseConnectionUrl() });
async function main() {
  await initializeNotifications(db);
  console.log("Notifications initialized. Existing workflow records are baselined; future handoffs generate alerts.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
