-- CreateTable
CREATE TABLE "LessonGuide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "previewJson" TEXT,
    "explanationId" TEXT,
    "videoUrl" TEXT,
    "videoTitle" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonGuide_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TextbookChapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonGuide_chapterId_key" ON "LessonGuide"("chapterId");
