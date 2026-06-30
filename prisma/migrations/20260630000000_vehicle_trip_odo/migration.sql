-- Lái xe tự xác nhận hoàn thành chuyến + nhập số odo (đồng hồ km) lúc đi / lúc về
ALTER TABLE "VehicleBooking" ADD COLUMN "odoStart" INTEGER;
ALTER TABLE "VehicleBooking" ADD COLUMN "odoEnd" INTEGER;
ALTER TABLE "VehicleBooking" ADD COLUMN "completedAt" TIMESTAMP(3);
