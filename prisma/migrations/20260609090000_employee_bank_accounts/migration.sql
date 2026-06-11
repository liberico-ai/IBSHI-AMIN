-- Nhân sự: tối đa 5 tài khoản ngân hàng lương [{ bank, accountNumber }].
ALTER TABLE "Employee" ADD COLUMN "bankAccounts" JSONB NOT NULL DEFAULT '[]';
