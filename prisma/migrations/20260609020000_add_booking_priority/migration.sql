-- Mức độ ưu tiên phiếu đặt xe: NONE | NORMAL | PRIORITY (Không / Bình thường / Ưu tiên).
ALTER TABLE "VehicleBooking" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
