-- AlterEnum
ALTER TYPE "VehicleIdentifierKind" ADD VALUE 'CODE';

-- AlterTable
ALTER TABLE "vehicle_search_rules" ADD COLUMN     "inputLabel" TEXT,
ADD COLUMN     "inputPlaceholder" TEXT;

