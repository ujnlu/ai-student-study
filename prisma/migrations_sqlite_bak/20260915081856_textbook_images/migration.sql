-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Textbook" (
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
    "contentSource" TEXT NOT NULL DEFAULT 'pdf',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sourceUpdatedAt" DATETIME,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Textbook_textbookVersionId_fkey" FOREIGN KEY ("textbookVersionId") REFERENCES "TextbookVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Textbook_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Textbook" ("createdAt", "error", "frontPage", "grade", "id", "importedAt", "pageCount", "pdfPath", "progress", "semester", "smarteduId", "sourceUpdatedAt", "status", "subjectId", "textbookVersionId", "title") SELECT "createdAt", "error", "frontPage", "grade", "id", "importedAt", "pageCount", "pdfPath", "progress", "semester", "smarteduId", "sourceUpdatedAt", "status", "subjectId", "textbookVersionId", "title" FROM "Textbook";
DROP TABLE "Textbook";
ALTER TABLE "new_Textbook" RENAME TO "Textbook";
CREATE UNIQUE INDEX "Textbook_smarteduId_key" ON "Textbook"("smarteduId");
CREATE INDEX "Textbook_textbookVersionId_grade_semester_idx" ON "Textbook"("textbookVersionId", "grade", "semester");
CREATE TABLE "new_TextbookPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textbookId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "imagePath" TEXT,
    "ocrStatus" TEXT NOT NULL DEFAULT 'none',
    CONSTRAINT "TextbookPage_textbookId_fkey" FOREIGN KEY ("textbookId") REFERENCES "Textbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TextbookPage" ("id", "pageNo", "text", "textbookId") SELECT "id", "pageNo", "text", "textbookId" FROM "TextbookPage";
DROP TABLE "TextbookPage";
ALTER TABLE "new_TextbookPage" RENAME TO "TextbookPage";
CREATE UNIQUE INDEX "TextbookPage_textbookId_pageNo_key" ON "TextbookPage"("textbookId", "pageNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
