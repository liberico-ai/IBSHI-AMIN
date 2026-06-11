-- Liên kết có cấu trúc cho nơi nhận đích danh (phục vụ lọc theo người xem + xác nhận).
ALTER TABLE "IncomingDocument" ADD COLUMN "routedEmployeeId" TEXT;
ALTER TABLE "IncomingDocument" ADD COLUMN "routedDepartmentId" TEXT;
CREATE INDEX "IncomingDocument_routedEmployeeId_idx" ON "IncomingDocument"("routedEmployeeId");
CREATE INDEX "IncomingDocument_routedDepartmentId_idx" ON "IncomingDocument"("routedDepartmentId");
