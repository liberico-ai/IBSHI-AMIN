-- Thư mời phỏng vấn: thông tin lịch PV + thời điểm gửi thư mời.
ALTER TABLE "Candidate" ADD COLUMN "interviewTime" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "interviewLocation" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "interviewContact" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "interviewInviteSentAt" TIMESTAMP(3);
