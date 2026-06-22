-- Thêm role ADMIN (quản trị hệ thống) vào enum UserRole.
-- Idempotent: chỉ thêm nếu chưa có.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
