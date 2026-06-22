-- Lương SP/khoán chia từ khoán tổ → số thật (có thể lẻ/âm) → đổi sang Float.
ALTER TABLE "PayrollRecord" ALTER COLUMN "pieceRateSalary" TYPE DOUBLE PRECISION;
