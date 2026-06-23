// Tab Tăng ca chỉ cho: chức vụ Tổ trưởng / Trưởng phòng (đề xuất) + HCNS/BGĐ/Quản lý (duyệt).
const OT_JOB_ROLES = ["Tổ trưởng", "Trưởng phòng"];
const OT_ROLES = ["MANAGER", "HR_ADMIN", "BOM", "ADMIN"];

export function canSeeOTTab(args: { jobRole?: string | null; role?: string | null }): boolean {
  return OT_JOB_ROLES.includes(args.jobRole || "") || OT_ROLES.includes(args.role || "");
}
