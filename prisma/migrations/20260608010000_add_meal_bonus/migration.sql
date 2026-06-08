-- Thêm mealBonus (tiền ăn thêm giờ — HR Excel cột AZ) vào PayrollManualInput.
ALTER TABLE "PayrollManualInput" ADD COLUMN "mealBonus" INTEGER NOT NULL DEFAULT 0;
