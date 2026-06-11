-- Đề xuất tăng ca theo nhóm: Tổ + danh sách nhân sự.
ALTER TABLE "OTRequest" ADD COLUMN "teamId" TEXT;
ALTER TABLE "OTRequest" ADD COLUMN "teamName" TEXT;
ALTER TABLE "OTRequest" ADD COLUMN "memberIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "OTRequest" ADD COLUMN "memberNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
