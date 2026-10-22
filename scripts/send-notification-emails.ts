import { databaseConnectionUrl } from "../src/lib/environmentMode";
import { PrismaClient } from "@prisma/client";
import { dispatchNotificationEmails } from "../src/lib/notificationEmails";
import { notificationEmailConfig } from "../src/lib/resendEmail";
const db = new PrismaClient({ datasourceUrl: databaseConnectionUrl() });
async function main() {
  if (!notificationEmailConfig()) throw new Error("Email environment variables are incomplete.");
  console.log(await dispatchNotificationEmails(db, { limit: 25, maxMs: 40000 }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Email processing failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
