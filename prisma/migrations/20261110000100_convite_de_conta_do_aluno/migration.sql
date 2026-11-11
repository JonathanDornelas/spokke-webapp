-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "accountInviteSentAt" TIMESTAMP(3),
ADD COLUMN     "accountInviteToken" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "Student_accountInviteToken_key" ON "Student"("accountInviteToken");
