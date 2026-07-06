-- Tổ SX: thêm cờ isActive để ẩn tổ cũ khi tái cơ cấu (giữ FK lịch sử khoán).
ALTER TABLE "ProductionTeam" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
