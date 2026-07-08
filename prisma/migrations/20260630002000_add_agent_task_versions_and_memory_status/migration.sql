ALTER TABLE "AgentScheduledTask" ADD COLUMN "activeVersionId" TEXT;
ALTER TABLE "AgentScheduledTask" ADD COLUMN "lastMemorySearchAt" TIMESTAMP(3);
ALTER TABLE "AgentScheduledTask" ADD COLUMN "lastMemorySearchUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentScheduledTask" ADD COLUMN "lastMemoryWriteAt" TIMESTAMP(3);
ALTER TABLE "AgentScheduledTask" ADD COLUMN "lastMemoryVectorCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "structuredSummaryJson" TEXT;
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "changesJson" TEXT;
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "importantItemsJson" TEXT;
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "rawPreview" TEXT;
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "memoryUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "memorySearchAt" TIMESTAMP(3);
ALTER TABLE "AgentScheduledTaskRun" ADD COLUMN "memoryWriteAt" TIMESTAMP(3);

CREATE TABLE "AgentTaskVersion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "trainingNotes" TEXT,
  "outputFormat" TEXT,
  "url" TEXT,
  "scheduleType" TEXT NOT NULL DEFAULT 'daily',
  "timeOfDay" TEXT,
  "daysOfWeek" TEXT,
  "previewSummary" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentTaskVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentTaskVersion_taskId_version_key" ON "AgentTaskVersion"("taskId", "version");
CREATE INDEX "AgentTaskVersion_userId_taskId_createdAt_idx" ON "AgentTaskVersion"("userId", "taskId", "createdAt");
CREATE INDEX "AgentScheduledTask_activeVersionId_idx" ON "AgentScheduledTask"("activeVersionId");

ALTER TABLE "AgentTaskVersion" ADD CONSTRAINT "AgentTaskVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTaskVersion" ADD CONSTRAINT "AgentTaskVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
