-- CreateTable
CREATE TABLE "ReciteText" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "piecesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReciteText_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TextbookChapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReciteText_chapterId_key" ON "ReciteText"("chapterId");
