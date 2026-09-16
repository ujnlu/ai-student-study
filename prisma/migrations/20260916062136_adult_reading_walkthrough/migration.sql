-- AlterTable
ALTER TABLE "Problem" ADD COLUMN "walkthrough" TEXT;

-- CreateTable
CREATE TABLE "ReadingPiece" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lang" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "questionsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Child" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT '🐼',
    "grade" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'child',
    "semester" INTEGER NOT NULL DEFAULT 1,
    "region" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Child_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Child" ("avatar", "createdAt", "familyId", "grade", "id", "name", "region", "semester") SELECT "avatar", "createdAt", "familyId", "grade", "id", "name", "region", "semester" FROM "Child";
DROP TABLE "Child";
ALTER TABLE "new_Child" RENAME TO "Child";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ReadingPiece_lang_level_idx" ON "ReadingPiece"("lang", "level");
