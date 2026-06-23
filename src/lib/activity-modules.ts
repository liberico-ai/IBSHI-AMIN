// Map 1 pathname (vd "/hanh-chinh/xe") → tên module dễ đọc, dùng cho log truy cập + báo cáo.

const HANH_CHINH: Record<string, string> = {
  "cong-van-den": "HC — Công văn đến",
  "cong-van-di": "HC — Công văn đi",
  "khach": "HC — Khách",
  "nha-an": "HC — Nhà ăn",
  "phong-hop": "HC — Phòng họp",
  "su-kien": "HC — Sự kiện",
  "sua-chua": "HC — Sửa chữa",
  "ve-sinh": "HC — Vệ sinh",
  "vpp": "HC — Văn phòng phẩm",
  "xe": "HC — Xe",
};

const CHAM_CONG: Record<string, string> = {
  "doi-soat": "Chấm công — Đối soát",
  "giai-trinh": "Chấm công — Giải trình",
  "nghi-phep": "Chấm công — Nghỉ phép",
  "phieu-to": "Chấm công — Phiếu tổ",
  "tang-ca": "Chấm công — Tăng ca",
  "tong-hop": "Chấm công — Tổng hợp",
};

const TOP: Record<string, string> = {
  "ho-so": "Hồ sơ nhân sự",
  "cham-cong": "Chấm công (M3)",
  "luong": "Lương (M7)",
  "tuyen-dung": "Tuyển dụng (M4)",
  "hanh-chinh": "Hành chính",
  "bao-cao": "Báo cáo",
  "cai-dat": "Cài đặt",
  "dao-tao": "Đào tạo",
  "hse": "HSE",
  "kpi": "KPI",
  "ky-luat": "Kỷ luật",
  "so-do": "Sơ đồ tổ chức",
};

export function moduleFromPath(path: string): string {
  const p = (path || "").split("?")[0].replace(/\/+$/, "");
  const seg = p.split("/").filter(Boolean); // ["hanh-chinh","xe"]
  if (seg.length === 0) return "Trang chủ";
  const [a, b] = seg;
  if (a === "hanh-chinh" && b && HANH_CHINH[b]) return HANH_CHINH[b];
  if (a === "cham-cong" && b && CHAM_CONG[b]) return CHAM_CONG[b];
  if (TOP[a]) return TOP[a];
  return a;
}

// ── Log tác vụ qua API (Phase 2) ──────────────────────────────────────────────
// Map segment tài nguyên trong path API → tên module dễ đọc.
const API_MODULE: Record<string, string> = {
  "room-bookings": "Phòng họp",
  "vehicles": "Xe",
  "vehicle-bookings": "Xe",
  "stationery": "Văn phòng phẩm",
  "payroll": "Lương (M7)",
  "salary": "Lương (M7)",
  "leave-requests": "Nghỉ phép",
  "ot-requests": "Tăng ca",
  "attendance": "Chấm công",
  "recruitment": "Tuyển dụng",
  "employees": "Hồ sơ nhân sự",
  "contracts": "Hợp đồng",
  "meals": "Nhà ăn",
  "documents": "Công văn",
  "events": "Sự kiện",
  "cleaning": "Vệ sinh",
  "hse": "HSE",
  "kpi": "KPI",
  "training": "Đào tạo",
  "disciplinary-actions": "Kỷ luật",
  "regulations": "Quy định",
  "ncrs": "NCR",
  "visitors": "Khách",
  "subcontractors": "Nhà thầu phụ",
  "certificates": "Chứng chỉ",
  "notifications": "Thông báo",
  "settings": "Cài đặt",
  "org-snapshots": "Sơ đồ tổ chức",
  "position-requirements": "Yêu cầu vị trí",
  "upload": "Tải tệp",
};

// path API dạng "/api/v1/<resource>/..." → tên module.
export function apiModuleFromPath(path: string): string {
  const p = (path || "").split("?")[0];
  const seg = p.split("/").filter(Boolean); // ["api","v1","room-bookings",...]
  const res = seg[0] === "api" ? seg[2] : seg[0];
  return API_MODULE[res] || res || "Khác";
}

// Suy ra loại hành động từ method + path (để log + hiển thị nhãn).
export function inferAction(method: string, path: string): "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "IMPORT" {
  const p = (path || "").toLowerCase();
  if (/\/(approve|sign|sign-contract|issue-contract|mark-result)(\/|$)/.test(p)) return "APPROVE";
  if (/\/(reject|mark-failed|cancel)(\/|$)/.test(p)) return "REJECT";
  if (/(import|upload|stock-in|bhxh|piece-rate|adjustment)(\/|$)/.test(p)) return "IMPORT";
  const m = (method || "").toUpperCase();
  if (m === "DELETE") return "DELETE";
  if (m === "PUT" || m === "PATCH") return "UPDATE";
  return "CREATE";
}
