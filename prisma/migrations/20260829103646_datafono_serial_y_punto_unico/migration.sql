-- CreateEnum
CREATE TYPE "TerminalStage" AS ENUM ('WAITING_TERMINAL', 'STARTED', 'READING_CARD', 'RESOLVED');

-- DropIndex
DROP INDEX "payment_points_parkingLotId_code_key";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "bin" TEXT,
ADD COLUMN     "installments" TEXT,
ADD COLUMN     "network" TEXT,
ADD COLUMN     "providerCode" TEXT,
ADD COLUMN     "rrn" TEXT,
ADD COLUMN     "terminalNumber" TEXT,
ADD COLUMN     "terminalStage" "TerminalStage" NOT NULL DEFAULT 'WAITING_TERMINAL',
ADD COLUMN     "transactionDate" TEXT,
ADD COLUMN     "transactionTime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_points_parkingLotId_key" ON "payment_points"("parkingLotId");

