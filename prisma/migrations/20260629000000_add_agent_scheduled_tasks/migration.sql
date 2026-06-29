CREATE TABLE "AgentScheduledTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "url" TEXT,
  "scheduleType" TEXT NOT NULL DEFAULT 'daily',
  "timeOfDay" TEXT,
  "daysOfWeek" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notifyOnRun" BOOLEAN NOT NULL DEFAULT true,
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "lastStatus" TEXT,
  "lastSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentScheduledTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentScheduledTaskRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentScheduledTask_userId_active_nextRunAt_idx" ON "AgentScheduledTask"("userId", "active", "nextRunAt");
CREATE INDEX "AgentScheduledTask_nextRunAt_active_idx" ON "AgentScheduledTask"("nextRunAt", "active");
CREATE INDEX "AgentScheduledTaskRun_userId_createdAt_idx" ON "AgentScheduledTaskRun"("userId", "createdAt");
CREATE INDEX "AgentScheduledTaskRun_taskId_createdAt_idx" ON "AgentScheduledTaskRun"("taskId", "createdAt");

ALTER TABLE "AgentScheduledTask" ADD CONSTRAINT "AgentScheduledTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentScheduledTaskRun" ADD CONSTRAINT "AgentScheduledTaskRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentScheduledTaskRun" ADD CONSTRAINT "AgentScheduledTaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
