-- 1 khối (Directorate) có thể có NHIỀU giám đốc phụ trách.
ALTER TABLE "Directorate" ADD COLUMN "directorIds" TEXT[] NOT NULL DEFAULT '{}';
