-- CreateTable
CREATE TABLE "AiInterpretation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weeklyReportId" TEXT,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputSnapshotHash" TEXT NOT NULL,
    "inputSnapshot" TEXT NOT NULL,
    "outputJson" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInterpretation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInterpretation_userId_kind_createdAt_idx" ON "AiInterpretation"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiInterpretation_weeklyReportId_createdAt_idx" ON "AiInterpretation"("weeklyReportId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInterpretation_inputSnapshotHash_idx" ON "AiInterpretation"("inputSnapshotHash");

-- AddForeignKey
ALTER TABLE "AiInterpretation" ADD CONSTRAINT "AiInterpretation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterpretation" ADD CONSTRAINT "AiInterpretation_weeklyReportId_fkey" FOREIGN KEY ("weeklyReportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
