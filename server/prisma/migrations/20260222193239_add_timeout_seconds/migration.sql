-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Monitor" ("createdAt", "expectedBody", "expectedStatus", "headers", "id", "intervalSeconds", "isActive", "method", "name", "updatedAt", "url") SELECT "createdAt", "expectedBody", "expectedStatus", "headers", "id", "intervalSeconds", "isActive", "method", "name", "updatedAt", "url" FROM "Monitor";
DROP TABLE "Monitor";
ALTER TABLE "new_Monitor" RENAME TO "Monitor";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
