-- Snapshot sĩ số phòng ban / tổ sản xuất theo tháng.
CREATE TABLE "OrgSnapshot" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refName" TEXT NOT NULL,
    "refCode" TEXT,
    "activeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgSnapshot_period_scope_refId_key" ON "OrgSnapshot"("period", "scope", "refId");
CREATE INDEX "OrgSnapshot_period_idx" ON "OrgSnapshot"("period");
