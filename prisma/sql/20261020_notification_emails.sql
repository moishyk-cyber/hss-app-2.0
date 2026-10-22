CREATE TABLE IF NOT EXISTS "NotificationEmail" (
  "id" TEXT PRIMARY KEY,
  "notificationId" TEXT NOT NULL REFERENCES "Notification"("id") ON DELETE CASCADE,
  "recipient" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "attemptToken" TEXT,
  "firstAttemptAt" TIMESTAMP(3),
  "payload" JSONB,
  "resendId" TEXT,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEmail_notificationId_key" ON "NotificationEmail"("notificationId");
CREATE INDEX IF NOT EXISTS "NotificationEmail_status_availableAt_idx" ON "NotificationEmail"("status", "availableAt");
