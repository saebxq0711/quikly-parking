-- CreateTable
CREATE TABLE "vehicle_search_rules" (
    "id" TEXT NOT NULL,
    "parkingLotId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "identifierKind" "VehicleIdentifierKind" NOT NULL,
    "searchSegment" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_search_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_search_rules_parkingLotId_vehicleType_key" ON "vehicle_search_rules"("parkingLotId", "vehicleType");

-- AddForeignKey
ALTER TABLE "vehicle_search_rules" ADD CONSTRAINT "vehicle_search_rules_parkingLotId_fkey" FOREIGN KEY ("parkingLotId") REFERENCES "parking_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
