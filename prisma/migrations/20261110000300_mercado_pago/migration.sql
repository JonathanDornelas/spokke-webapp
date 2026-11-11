-- O gateway escolhido é o Mercado Pago (docs/adr-002-billing.md). O esqueleto do
-- Stripe nunca cobrou ninguém: "stripeCustomerId" e "StripeEvent" estavam vazios
-- (conferido antes desta migration), então saem sem passo de cópia.

-- DropIndex
DROP INDEX "Teacher_stripeCustomerId_key";

-- AlterTable
ALTER TABLE "Teacher" DROP COLUMN "stripeCustomerId";

-- DropTable
DROP TABLE "StripeEvent";

-- CreateTable
CREATE TABLE "ProviderSubscription" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "plano" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,

    CONSTRAINT "ProviderSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderSubscription_teacherId_createdAt_idx" ON "ProviderSubscription"("teacherId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProviderSubscription" ADD CONSTRAINT "ProviderSubscription_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

