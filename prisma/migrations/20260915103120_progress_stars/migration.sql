-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "box" TEXT;

-- AlterTable
ALTER TABLE "PracticeSet" ADD COLUMN "chapterId" TEXT;

-- CreateTable
CREATE TABLE "ChildProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChildProgress_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChildProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TextbookChapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StarEvent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Problem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "uploadId" TEXT,
    "knowledgePointId" TEXT,
    "chapterId" TEXT,
    "index" INTEGER NOT NULL DEFAULT 0,
    "stem" TEXT NOT NULL,
    "answer" TEXT,
    "solution" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "parentProblemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Problem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Problem_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Problem_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Problem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TextbookChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Problem" ("answer", "createdAt", "difficulty", "id", "index", "knowledgePointId", "parentProblemId", "solution", "source", "stem", "subjectId", "uploadId") SELECT "answer", "createdAt", "difficulty", "id", "index", "knowledgePointId", "parentProblemId", "solution", "source", "stem", "subjectId", "uploadId" FROM "Problem";
DROP TABLE "Problem";
ALTER TABLE "new_Problem" RENAME TO "Problem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChildProgress_childId_subjectId_key" ON "ChildProgress"("childId", "subjectId");

-- CreateIndex
CREATE INDEX "StarEvent_childId_createdAt_idx" ON "StarEvent"("childId", "createdAt");
