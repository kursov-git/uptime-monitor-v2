-- Redefine Agent for v2 (tokenHash + lifecycle fields)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "heartbeatIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "offlineAfterSec" INTEGER NOT NULL DEFAULT 90,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve existing tokens (no hashing in SQL; app-level backfill can replace values)
INSERT INTO "new_Agent" (
    "id", "name", "tokenHash", "status", "lastSeen", "createdAt"
)
SELECT
    "id", "name", "token", "status", "lastSeen", "createdAt"
FROM "Agent";

DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_tokenHash_key" ON "Agent"("tokenHash");
CREATE INDEX "Agent_status_lastSeen_idx" ON "Agent"("status", "lastSeen");

-- Add Monitor.agentId relation to Agent
CREATE TABLE "new_Monitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "intervalSeconds" REAL NOT NULL DEFAULT 60,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 30,
    "expectedStatus" INTEGER NOT NULL DEFAULT 200,
    "expectedBody" TEXT,
    "headers" TEXT,
    "authMethod" TEXT NOT NULL DEFAULT 'NONE',
    "authUrl" TEXT,
    "authPayload" TEXT,
    "authTokenRegex" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "agentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Monitor_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Monitor" (
    "id", "name", "url", "method", "intervalSeconds", "timeoutSeconds", "expectedStatus", "expectedBody",
    "headers", "authMethod", "authUrl", "authPayload", "authTokenRegex", "isActive", "createdAt", "updatedAt"
)
SELECT
    "id", "name", "url", "method", "intervalSeconds", "timeoutSeconds", "expectedStatus", "expectedBody",
    "headers", "authMethod", "authUrl", "authPayload", "authTokenRegex", "isActive", "createdAt", "updatedAt"
FROM "Monitor";

DROP TABLE "Monitor";
ALTER TABLE "new_Monitor" RENAME TO "Monitor";
CREATE INDEX "Monitor_agentId_isActive_idx" ON "Monitor"("agentId", "isActive");

-- Add idempotency key to CheckResult
CREATE TABLE "new_CheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isUp" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "agentId" TEXT,
    "resultIdempotencyKey" TEXT,
    CONSTRAINT "CheckResult_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CheckResult_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CheckResult" (
    "id", "monitorId", "timestamp", "isUp", "responseTimeMs", "statusCode", "error", "agentId"
)
SELECT
    "id", "monitorId", "timestamp", "isUp", "responseTimeMs", "statusCode", "error", "agentId"
FROM "CheckResult";

DROP TABLE "CheckResult";
ALTER TABLE "new_CheckResult" RENAME TO "CheckResult";
CREATE UNIQUE INDEX "CheckResult_resultIdempotencyKey_key" ON "CheckResult"("resultIdempotencyKey");
CREATE INDEX "CheckResult_monitorId_timestamp_idx" ON "CheckResult"("monitorId", "timestamp" DESC);
CREATE INDEX "CheckResult_agentId_timestamp_idx" ON "CheckResult"("agentId", "timestamp" DESC);

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
