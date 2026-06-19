-- Bỏ làm tròn các khoản tiền trung gian → đổi sang Float để chứa số thật (số lẻ).
-- (tncn, netSalary giữ Int vì đã làm tròn chuẩn; baseSalary/bhxh là số nguyên sẵn.)
ALTER TABLE "PayrollRecord"
  ALTER COLUMN "otherIncome" TYPE DOUBLE PRECISION,
  ALTER COLUMN "otPay"       TYPE DOUBLE PRECISION,
  ALTER COLUMN "grossSalary" TYPE DOUBLE PRECISION;
