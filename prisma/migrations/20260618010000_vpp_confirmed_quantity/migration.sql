-- Thêm cột confirmedQuantity: số NV đã xác nhận đã nhận (xác nhận từng phần theo số đã cấp).
ALTER TABLE "StationeryRequestItem"
  ADD COLUMN IF NOT EXISTS "confirmedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
