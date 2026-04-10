# Fixtures

Place sample NAS export files here for end-to-end migration testing.

## Expected files

| File | Description |
|------|-------------|
| `nas-export.xlsx` | Sample NAS attendance/payroll export (xlsx format) |

## nas-export.xlsx columns

The migration script (`scripts/migrate-nas-data.ts`) expects these column headers in row 1:

| Column | Accepted headers | Example value |
|--------|-----------------|---------------|
| Employee code | Mã NV, MaNV | NV001 |
| Full name | Họ tên, HoTen | Nguyễn Văn An |
| Department | Phòng ban, PhongBan | Sản xuất |
| Position | Chức vụ, ChucVu | Công nhân |
| Date | Ngày, Ngay | 2026-01-15 |
| Attendance status | Trạng thái, TrangThai | Có mặt |
| Base salary | Lương CB, LuongCB | 8000000 |
| Allowances | Phụ cấp, PhuCap | 500000 |
| Deductions | Khấu trừ, KhauTru | 0 |

## Usage

```bash
# Dry run (no DB writes)
npx ts-node --project tsconfig.scripts.json scripts/migrate-nas-data.ts \
  --file scripts/fixtures/nas-export.xlsx --dry-run

# Live migration
npx ts-node --project tsconfig.scripts.json scripts/migrate-nas-data.ts \
  --file scripts/fixtures/nas-export.xlsx
```
