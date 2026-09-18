-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiAssistant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "supportVision" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiAssistant_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiAssistant_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AiAssistant" ("createdAt", "familyId", "id", "isDefault", "maxTokens", "model", "name", "providerId", "role", "supportVision", "systemPrompt", "temperature", "updatedAt") SELECT "createdAt", "familyId", "id", "isDefault", "maxTokens", "model", "name", "providerId", "role", "supportVision", "systemPrompt", "temperature", "updatedAt" FROM "AiAssistant";
DROP TABLE "AiAssistant";
ALTER TABLE "new_AiAssistant" RENAME TO "AiAssistant";
CREATE INDEX "AiAssistant_familyId_role_idx" ON "AiAssistant"("familyId", "role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 已有助手全部改成"自动"，不再需要家长手动调这个数字
UPDATE "AiAssistant" SET "maxTokens" = 0;
