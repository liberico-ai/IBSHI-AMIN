-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VehicleType" ADD VALUE 'PICKUP_TRUCK';
ALTER TYPE "VehicleType" ADD VALUE 'CONTAINER';
ALTER TYPE "VehicleType" ADD VALUE 'FORKLIFT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "erpCode" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "currentMileage" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FuelLog" ADD COLUMN     "invoiceUrl" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceRecord" ADD COLUMN     "location" TEXT,
ADD COLUMN     "odometerKm" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_erpCode_key" ON "User"("erpCode");

