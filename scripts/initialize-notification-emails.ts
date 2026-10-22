import { databaseConnectionUrl } from "../src/lib/environmentMode";
import { PrismaClient } from "@prisma/client";
import { initializeNotificationEmails } from "../src/lib/notificationEmails";
const db = new PrismaClient({ datasourceUrl: databaseConnectionUrl() });
initializeNotificationEmails(db)
  .then(() => console.log("Email notifications enabled for future alerts. Existing inbox history was not queued."))
  .catch(error => { console.error(error instanceof Error ? error.message : "Could not initialize email notifications"); process.exitCode = 1; })
  .finally(() => db.$disconnect());
