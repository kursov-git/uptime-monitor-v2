-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isUp" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "agentId" TEXT,
    CONSTRAINT "CheckResult_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CheckResult_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CheckResult" ("error", "id", "isUp", "monitorId", "responseTimeMs", "statusCode", "timestamp") SELECT "error", "id", "isUp", "monitorId", "responseTimeMs", "statusCode", "timestamp" FROM "CheckResult";
DROP TABLE "CheckResult";
ALTER TABLE "new_CheckResult" RENAME TO "CheckResult";
CREATE INDEX "CheckResult_monitorId_timestamp_idx" ON "CheckResult"("monitorId", "timestamp" DESC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Agent_token_key" ON "Agent"("token");
