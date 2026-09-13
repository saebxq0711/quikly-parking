-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "parkingLotId" TEXT NOT NULL,
    "identification" TEXT NOT NULL,
    "idType" TEXT NOT NULL DEFAULT '13',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "siigoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_parkingLotId_identification_key" ON "customers"("parkingLotId", "identification");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_parkingLotId_fkey" FOREIGN KEY ("parkingLotId") REFERENCES "parking_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

