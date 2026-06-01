-- Phụ lục hợp đồng
CREATE TABLE "ContractAddendum" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "addendumNumber" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "oldJobRole" TEXT,
    "newJobRole" TEXT,
    "oldJobPosition" TEXT,
    "newJobPosition" TEXT,
    "oldBaseSalary" INTEGER,
    "newBaseSalary" INTEGER,
    "oldAllowance" INTEGER,
    "newAllowance" INTEGER,
    "oldKpi" INTEGER,
    "newKpi" INTEGER,
    "documentHtml" TEXT,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAddendum_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContractAddendum_contractId_idx" ON "ContractAddendum"("contractId");
CREATE INDEX "ContractAddendum_status_idx" ON "ContractAddendum"("status");
ALTER TABLE "ContractAddendum" ADD CONSTRAINT "ContractAddendum_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
