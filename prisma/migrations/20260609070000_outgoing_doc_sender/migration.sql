-- Công văn đi: người/đơn vị gửi (Công ty hay Cá nhân/phòng ban).
ALTER TABLE "OutgoingDocument" ADD COLUMN "senderType" TEXT NOT NULL DEFAULT 'CONG_TY';
ALTER TABLE "OutgoingDocument" ADD COLUMN "senderName" TEXT;
