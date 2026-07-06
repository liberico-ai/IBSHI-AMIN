-- Khoán theo XƯỞNG (cấp phòng ban) từ T7/2026: teamId nullable + thêm departmentId.
ALTER TABLE "PieceRateRecord" ALTER COLUMN "teamId" DROP NOT NULL;
ALTER TABLE "PieceRateRecord" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "PieceRateRecord" ADD CONSTRAINT "PieceRateRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PieceRateRecord_departmentId_idx" ON "PieceRateRecord"("departmentId");
