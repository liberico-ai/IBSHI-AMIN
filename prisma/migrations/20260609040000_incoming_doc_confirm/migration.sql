-- Xác nhận đã nhận công văn đến (đích danh cá nhân/phòng ban) — theo dõi lịch sử/thất lạc.
ALTER TABLE "IncomingDocument" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "IncomingDocument" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "IncomingDocument" ADD COLUMN "confirmedByName" TEXT;
