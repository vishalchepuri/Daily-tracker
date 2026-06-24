-- CreateTable
CREATE TABLE "PushNotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "deviceId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "endpointHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushNotificationLog_userId_createdAt_idx" ON "PushNotificationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PushNotificationLog_userId_status_createdAt_idx" ON "PushNotificationLog"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "PushNotificationLog" ADD CONSTRAINT "PushNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
