-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "teacherId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "interaction" TEXT NOT NULL,
    "contexto" JSONB NOT NULL,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemReport_status_createdAt_idx" ON "ProblemReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemReport_teacherId_idx" ON "ProblemReport"("teacherId");

-- CreateIndex
CREATE INDEX "ProblemReport_attemptId_idx" ON "ProblemReport"("attemptId");

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
