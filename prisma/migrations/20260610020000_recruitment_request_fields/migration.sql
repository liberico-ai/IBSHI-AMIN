-- Đề xuất tuyển dụng: thêm mô tả CV, yêu cầu bằng cấp, khoảng lương, thời gian tuyển.
ALTER TABLE "RecruitmentRequest" ADD COLUMN "jobDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RecruitmentRequest" ADD COLUMN "degreeRequirement" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RecruitmentRequest" ADD COLUMN "salaryMin" INTEGER;
ALTER TABLE "RecruitmentRequest" ADD COLUMN "salaryMax" INTEGER;
ALTER TABLE "RecruitmentRequest" ADD COLUMN "recruitFrom" TIMESTAMP(3);
ALTER TABLE "RecruitmentRequest" ADD COLUMN "recruitTo" TIMESTAMP(3);
