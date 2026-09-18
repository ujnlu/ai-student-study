-- CreateTable
CREATE TABLE "PracticeSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "mistakeId" TEXT,
    "knowledgePointId" TEXT,
    "timeLimitSec" INTEGER,
    "total" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "durationSec" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PracticeSet_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeSet_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "MistakeEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PracticeSet_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "problemId" TEXT NOT NULL,
    "childAnswer" TEXT,
    "isCorrect" BOOLEAN,
    CONSTRAINT "PracticeItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "PracticeSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PracticeSet_childId_status_createdAt_idx" ON "PracticeSet"("childId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeItem_setId_index_key" ON "PracticeItem"("setId", "index");
