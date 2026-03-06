-- CreateTable
CREATE TABLE "NotificationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "NotificationHistory_monitorId_timestamp_idx" ON "NotificationHistory"("monitorId", "timestamp" DESC);
