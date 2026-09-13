-- AlterTable
ALTER TABLE "payment_points" ADD COLUMN     "hasPrinter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receiptToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptToken_key" ON "payments"("receiptToken");

