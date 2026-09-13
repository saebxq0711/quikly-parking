-- AlterTable
ALTER TABLE "password_reset_requests" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenHash" TEXT,
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_requests_tokenHash_key" ON "password_reset_requests"("tokenHash");

