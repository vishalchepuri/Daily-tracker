ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "micronutrientTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "micronutrientTargetsJson" TEXT;
