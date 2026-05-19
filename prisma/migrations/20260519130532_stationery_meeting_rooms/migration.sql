-- CreateEnum
CREATE TYPE "RoomBookingStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "StationeryRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "RoomBooking" DROP COLUMN "attendees",
DROP COLUMN "bookedBy",
DROP COLUMN "equipmentNeeded",
DROP COLUMN "notes",
DROP COLUMN "purpose",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "priorityNote" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "requesterId" TEXT NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "RoomBookingStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';

-- CreateTable
CREATE TABLE "BookingAttendee" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rsvp" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "BookingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationerySupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactInfo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationerySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationeryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StationeryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationeryStockIn" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "importDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationeryStockIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationeryStockInItem" (
    "id" TEXT NOT NULL,
    "stockInId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StationeryStockInItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationeryRequest" (
    "id" TEXT NOT NULL,
    "requesterEmployeeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "StationeryRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,

    CONSTRAINT "StationeryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationeryRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "StationeryRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingAttendee_employeeId_idx" ON "BookingAttendee"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttendee_bookingId_employeeId_key" ON "BookingAttendee"("bookingId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StationerySupplier_name_key" ON "StationerySupplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StationeryItem_normalizedName_key" ON "StationeryItem"("normalizedName");

-- CreateIndex
CREATE INDEX "StationeryItem_normalizedName_idx" ON "StationeryItem"("normalizedName");

-- CreateIndex
CREATE INDEX "StationeryStockIn_importDate_idx" ON "StationeryStockIn"("importDate");

-- CreateIndex
CREATE INDEX "StationeryStockIn_createdById_idx" ON "StationeryStockIn"("createdById");

-- CreateIndex
CREATE INDEX "StationeryStockInItem_stockInId_idx" ON "StationeryStockInItem"("stockInId");

-- CreateIndex
CREATE INDEX "StationeryStockInItem_itemId_idx" ON "StationeryStockInItem"("itemId");

-- CreateIndex
CREATE INDEX "StationeryRequest_status_idx" ON "StationeryRequest"("status");

-- CreateIndex
CREATE INDEX "StationeryRequest_createdById_idx" ON "StationeryRequest"("createdById");

-- CreateIndex
CREATE INDEX "StationeryRequest_requesterEmployeeId_idx" ON "StationeryRequest"("requesterEmployeeId");

-- CreateIndex
CREATE INDEX "StationeryRequestItem_requestId_idx" ON "StationeryRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "StationeryRequestItem_itemId_idx" ON "StationeryRequestItem"("itemId");

-- CreateIndex
CREATE INDEX "RoomBooking_requesterId_idx" ON "RoomBooking"("requesterId");

-- CreateIndex
CREATE INDEX "RoomBooking_status_idx" ON "RoomBooking"("status");

-- AddForeignKey
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RoomBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationeryStockIn" ADD CONSTRAINT "StationeryStockIn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "StationerySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationeryStockInItem" ADD CONSTRAINT "StationeryStockInItem_stockInId_fkey" FOREIGN KEY ("stockInId") REFERENCES "StationeryStockIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationeryStockInItem" ADD CONSTRAINT "StationeryStockInItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StationeryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationeryRequest" ADD CONSTRAINT "StationeryRequest_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationeryRequestItem" ADD CONSTRAINT "StationeryRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StationeryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationeryRequestItem" ADD CONSTRAINT "StationeryRequestItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StationeryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

