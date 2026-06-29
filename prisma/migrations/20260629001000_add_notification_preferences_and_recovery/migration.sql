ALTER TABLE "UserProfile"
ADD COLUMN "notificationQuietStart" TEXT,
ADD COLUMN "notificationQuietEnd" TEXT,
ADD COLUMN "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyMedications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyRefills" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyAgentTasks" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "RecoveryCheckIn" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sleepHours" DOUBLE PRECISION,
  "energy" INTEGER,
  "soreness" INTEGER,
  "mood" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecoveryCheckIn_userId_date_idx" ON "RecoveryCheckIn"("userId", "date");

ALTER TABLE "RecoveryCheckIn"
ADD CONSTRAINT "RecoveryCheckIn_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
