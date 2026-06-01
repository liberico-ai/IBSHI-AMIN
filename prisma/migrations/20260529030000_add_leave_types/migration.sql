-- Thêm loại nghỉ: Tai nạn lao động (WL), Học tập (HT)
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'WORK_ACCIDENT';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'STUDY';
