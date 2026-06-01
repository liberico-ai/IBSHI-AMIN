-- HĐ thử việc soạn trên thư mời (duyệt trước khi onboard)
ALTER TABLE "OfferLetter" ADD COLUMN "probationDraft" JSONB;
ALTER TABLE "OfferLetter" ADD COLUMN "probationDraftStatus" TEXT;
ALTER TABLE "OfferLetter" ADD COLUMN "probationApprovedBy" TEXT;
ALTER TABLE "OfferLetter" ADD COLUMN "probationApprovedAt" TIMESTAMP(3);
ALTER TABLE "OfferLetter" ADD COLUMN "probationRejectReason" TEXT;
