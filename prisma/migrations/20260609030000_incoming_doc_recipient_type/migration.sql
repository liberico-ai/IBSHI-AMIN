-- Phân loại công văn đến: gửi cho Công ty (CONG_TY) hay đích danh cá nhân/phòng ban (CA_NHAN).
ALTER TABLE "IncomingDocument" ADD COLUMN "recipientType" TEXT NOT NULL DEFAULT 'CONG_TY';
