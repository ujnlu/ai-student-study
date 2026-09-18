-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "assistantId" TEXT,
    "title" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL,
    "summary" TEXT,
    "quizQ" TEXT,
    "quizA" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Explanation_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Explanation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Explanation_problemId_childId_idx" ON "Explanation"("problemId", "childId");
