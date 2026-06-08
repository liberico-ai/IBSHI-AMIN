-- Add seriesId field to RoomBooking + VehicleBooking for recurring bookings support.
ALTER TABLE "RoomBooking" ADD COLUMN "seriesId" TEXT;
CREATE INDEX "RoomBooking_seriesId_idx" ON "RoomBooking"("seriesId");

ALTER TABLE "VehicleBooking" ADD COLUMN "seriesId" TEXT;
CREATE INDEX "VehicleBooking_seriesId_idx" ON "VehicleBooking"("seriesId");
