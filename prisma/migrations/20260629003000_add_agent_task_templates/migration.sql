CREATE TABLE "AgentTaskTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "prompt" TEXT NOT NULL,
  "outputFormat" TEXT,
  "category" TEXT NOT NULL DEFAULT 'general',
  "defaultScheduleType" TEXT NOT NULL DEFAULT 'daily',
  "defaultTimeOfDay" TEXT,
  "defaultDaysOfWeek" TEXT,
  "status" TEXT NOT NULL DEFAULT 'private',
  "shared" BOOLEAN NOT NULL DEFAULT false,
  "submittedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentTaskTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentScheduledTask" ADD COLUMN "outputFormat" TEXT;
ALTER TABLE "AgentScheduledTask" ADD COLUMN "templateId" TEXT;

CREATE INDEX "AgentTaskTemplate_submittedById_status_createdAt_idx" ON "AgentTaskTemplate"("submittedById", "status", "createdAt");
CREATE INDEX "AgentTaskTemplate_status_shared_createdAt_idx" ON "AgentTaskTemplate"("status", "shared", "createdAt");
CREATE INDEX "AgentScheduledTask_templateId_idx" ON "AgentScheduledTask"("templateId");

ALTER TABLE "AgentTaskTemplate" ADD CONSTRAINT "AgentTaskTemplate_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTaskTemplate" ADD CONSTRAINT "AgentTaskTemplate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentScheduledTask" ADD CONSTRAINT "AgentScheduledTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgentTaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
