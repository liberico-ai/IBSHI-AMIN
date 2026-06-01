-- Tách phụ cấp ra 4 thành phần
ALTER TABLE "ContractAddendum" ADD COLUMN "oldFarAllowance" INTEGER;
ALTER TABLE "ContractAddendum" ADD COLUMN "newFarAllowance" INTEGER;
ALTER TABLE "ContractAddendum" ADD COLUMN "oldPositionAllowance" INTEGER;
ALTER TABLE "ContractAddendum" ADD COLUMN "newPositionAllowance" INTEGER;
