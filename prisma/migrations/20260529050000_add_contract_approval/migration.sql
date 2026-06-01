-- Trạng thái duyệt HĐ (HĐ thử việc cần TP HCNS duyệt) + metadata duyệt
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "Contract" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "Contract" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "rejectedReason" TEXT;
