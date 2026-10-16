CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "eventKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_eventKey_key" ON "Notification"("userId", "eventKey");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE TABLE IF NOT EXISTS "NotificationState" (
  "key" TEXT PRIMARY KEY,
  "snapshot" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "notificationProcessedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ActivityLog_notification_pending_idx" ON "ActivityLog"("at") WHERE "notificationProcessedAt" IS NULL;
