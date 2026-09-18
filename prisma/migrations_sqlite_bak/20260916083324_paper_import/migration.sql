-- AlterTable
ALTER TABLE "Problem" ADD COLUMN "kind" TEXT;

-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "year" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'pdf',
    "filePaths" TEXT,
    "rawText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Paper_familyId_createdAt_idx" ON "Paper"("familyId", "createdAt");
