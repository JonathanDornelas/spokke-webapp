-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_teacherId_readAt_updatedAt_idx" ON "Notification"("teacherId", "readAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Notification_teacherId_key_idx" ON "Notification"("teacherId", "key");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

