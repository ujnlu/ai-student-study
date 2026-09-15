-- CreateTable
CREATE TABLE "Textbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textbookVersionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "smarteduId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pdfPath" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "frontPage" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sourceUpdatedAt" DATETIME,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Textbook_textbookVersionId_fkey" FOREIGN KEY ("textbookVersionId") REFERENCES "TextbookVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Textbook_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TextbookChapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textbookId" TEXT NOT NULL,
    "parentId" TEXT,
    "nodeId" TEXT,
    "title" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    CONSTRAINT "TextbookChapter_textbookId_fkey" FOREIGN KEY ("textbookId") REFERENCES "Textbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TextbookChapter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TextbookChapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TextbookPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textbookId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "TextbookPage_textbookId_fkey" FOREIGN KEY ("textbookId") REFERENCES "Textbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnowledgePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "textbookVersionId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "chapterId" TEXT,
    CONSTRAINT "KnowledgePoint_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgePoint_textbookVersionId_fkey" FOREIGN KEY ("textbookVersionId") REFERENCES "TextbookVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgePoint_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "TextbookChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgePoint" ("description", "grade", "id", "name", "semester", "sortOrder", "subjectId", "textbookVersionId", "unit") SELECT "description", "grade", "id", "name", "semester", "sortOrder", "subjectId", "textbookVersionId", "unit" FROM "KnowledgePoint";
DROP TABLE "KnowledgePoint";
ALTER TABLE "new_KnowledgePoint" RENAME TO "KnowledgePoint";
CREATE INDEX "KnowledgePoint_textbookVersionId_grade_semester_idx" ON "KnowledgePoint"("textbookVersionId", "grade", "semester");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Textbook_smarteduId_key" ON "Textbook"("smarteduId");

-- CreateIndex
CREATE INDEX "Textbook_textbookVersionId_grade_semester_idx" ON "Textbook"("textbookVersionId", "grade", "semester");

-- CreateIndex
CREATE INDEX "TextbookChapter_textbookId_sortOrder_idx" ON "TextbookChapter"("textbookId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TextbookPage_textbookId_pageNo_key" ON "TextbookPage"("textbookId", "pageNo");
