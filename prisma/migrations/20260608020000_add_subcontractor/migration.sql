-- Danh mục nhà thầu phụ làm việc tại nhà máy (HCNS quản lý).
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subcontractor_name_key" ON "Subcontractor"("name");
CREATE INDEX "Subcontractor_active_idx" ON "Subcontractor"("active");

-- Seed danh sách thầu phụ hiện tại (file "NHÀ THẦU.xlsx").
INSERT INTO "Subcontractor" ("id", "name", "companyName", "updatedAt") VALUES
  (gen_random_uuid(), 'Nhà thầu Tùng', 'Trần Sinh Tùng', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Hưng', 'CÔNG TY TNHH CƠ KHÍ THƯƠNG MẠI LINH HUY', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Việt Hải', 'Công ty CP Công nghiệp Việt Hải', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Đồng ( Tuấn )', 'Công ty TNHH Sản xuất Kết cấu thép ĐT', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Huyền Trang (Mạnh Khởi)', 'Công ty CP Cơ khí Huyền Trang', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Giang Sơn', 'Công ty Cổ phần Cơ điện Giang Sơn', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Tuấn Đạt', 'CÔNG TY TNHH CHỐNG ĂN MÒN TUẤN ĐẠT', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Vemco', 'CÔNG TY TNHH MTV VEMCO HOLDING', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Nhà thầu Phong Sơn', 'Công ty Cổ phần đầu tư và xây dựng Phong Sơn', CURRENT_TIMESTAMP);
