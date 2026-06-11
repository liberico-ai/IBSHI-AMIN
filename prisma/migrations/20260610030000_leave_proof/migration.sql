-- Giấy tờ chứng minh cho đơn xin nghỉ (ốm/thai sản/đám ma/đám cưới) — hạn 7 ngày.
ALTER TABLE "LeaveRequest" ADD COLUMN "proofUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LeaveRequest" ADD COLUMN "proofDeadline" TIMESTAMP(3);
ALTER TABLE "LeaveRequest" ADD COLUMN "proofSubmittedAt" TIMESTAMP(3);
