CREATE TABLE "AgentCronHit" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "mode" TEXT NOT NULL,
  "checked" INTEGER NOT NULL DEFAULT 0,
  "ran" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentCronHit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentCronHit_userId_createdAt_idx" ON "AgentCronHit"("userId", "createdAt");
CREATE INDEX "AgentCronHit_createdAt_idx" ON "AgentCronHit"("createdAt");

ALTER TABLE "AgentCronHit"
ADD CONSTRAINT "AgentCronHit_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
