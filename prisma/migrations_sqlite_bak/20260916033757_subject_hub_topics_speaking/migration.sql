-- AlterTable
ALTER TABLE "Problem" ADD COLUMN "topic" TEXT;

-- CreateTable
CREATE TABLE "TopicLecture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "json" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SpeakingLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "transcript" TEXT,
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'recite',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recitation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recitation_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TextbookChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recitation" ("accuracy", "chapterId", "childId", "createdAt", "id", "text", "title", "transcript") SELECT "accuracy", "chapterId", "childId", "createdAt", "id", "text", "title", "transcript" FROM "Recitation";
DROP TABLE "Recitation";
ALTER TABLE "new_Recitation" RENAME TO "Recitation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TopicLecture_code_key" ON "TopicLecture"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakingLesson_code_key" ON "SpeakingLesson"("code");

-- CreateIndex
CREATE INDEX "Problem_topic_source_idx" ON "Problem"("topic", "source");
