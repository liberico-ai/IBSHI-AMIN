// ════════════════════════════════════════════════════════════════════════════
// DANH MỤC QUYỀN — ma trận phân quyền dạng CÂY cha–con.
//   - PERMISSION_CATALOG: Module → Tính năng con → các hành động áp dụng.
//   - PERMISSION_TEMPLATES: các "Nhóm quyền" mẫu (tick sẵn theo gói).
//   - Quyền hiệu lực = quyền của Nhóm quyền  ⊕  ghi đè riêng (AccessGrant) của account.
// Định danh 1 ô quyền = `${feature.key}:${action}`  (vd "m10.xe.doixe:edit").
//   - Export ⊂ Xem (view). Import = ô riêng. Duyệt 2 cấp = approve1 / approve2.
// ════════════════════════════════════════════════════════════════════════════

export type Action =
  | "view" | "create" | "edit" | "delete"
  | "approve" | "approve1" | "approve2"
  | "import" | "run";

export const ACTION_LABELS: Record<Action, string> = {
  view: "Xem",
  create: "Thêm",
  edit: "Sửa",
  delete: "Xóa",
  approve: "Duyệt",
  approve1: "Duyệt C1",
  approve2: "Duyệt C2",
  import: "Import",
  run: "Chạy",
};

export type Feature = {
  key: string;         // định danh duy nhất, vd "m10.xe.doixe"
  label: string;       // "Đội xe"
  group?: string;      // nhãn nhóm con (để gom hiển thị trong 1 module), vd "Quản lý xe"
  actions: Action[];   // các hành động áp dụng cho tính năng này (chỉ hiện đúng ô này)
};

export type ModuleGroup = {
  module: string;      // nhãn module trên ma trận
  features: Feature[];
};

// Bộ hành động dùng lại
const CRUD: Action[] = ["view", "create", "edit", "delete"];
const CRUDA: Action[] = ["view", "create", "edit", "delete", "approve"];
const CRU: Action[] = ["view", "create", "edit"];
const VC: Action[] = ["view", "create"];

export const PERMISSION_CATALOG: ModuleGroup[] = [
  {
    module: "M1 · Hồ sơ nhân sự",
    features: [
      { key: "m1.hoso", label: "Hồ sơ nhân sự", actions: CRUD },
      { key: "m1.concai", label: "Con cái", actions: CRUD },
      { key: "m1.npt", label: "Người phụ thuộc (giảm trừ)", actions: CRUD },
      { key: "m1.hopdong", label: "Hợp đồng lao động", actions: CRUDA },
      { key: "m1.phuluc", label: "Phụ lục hợp đồng", actions: ["view", "create", "edit", "approve"] },
    ],
  },
  {
    module: "M2 · Sơ đồ tổ chức",
    features: [
      { key: "m2.sodo", label: "Sơ đồ / Ảnh chụp tổ chức", actions: ["view", "create", "delete"] },
      { key: "m2.phongban", label: "Phòng ban", actions: CRUD },
      { key: "m2.chucdanh", label: "Chức danh", actions: CRUD },
    ],
  },
  {
    module: "M3 · Chấm công",
    features: [
      { key: "m3.bangcong", label: "Bảng chấm công", actions: ["view", "edit", "import"] },
      { key: "m3.nghiphep", label: "Nghỉ phép", actions: ["view", "create", "edit", "delete", "approve1", "approve2"] },
      { key: "m3.tangca", label: "Tăng ca (OT)", actions: ["view", "create", "edit", "delete", "approve"] },
    ],
  },
  {
    module: "M4 · Tuyển dụng",
    features: [
      { key: "m4.yeucau", label: "Yêu cầu tuyển dụng", actions: CRUD },
      { key: "m4.ungvien", label: "Ứng viên", actions: CRUD },
      { key: "m4.offer", label: "Thư mời nhận việc (Offer)", actions: CRUDA },
      { key: "m4.thuviec", label: "Đánh giá thử việc", actions: CRUDA },
      { key: "m4.onboarding", label: "Onboarding (nhận việc)", actions: CRUD },
      { key: "m4.vitri", label: "Yêu cầu vị trí (mô tả CV)", actions: CRUD },
    ],
  },
  {
    module: "M5 · Đào tạo & Chứng chỉ",
    features: [
      { key: "m5.daotao", label: "Kế hoạch đào tạo", actions: CRUD },
      { key: "m5.chungchi", label: "Chứng chỉ nhân sự", actions: CRUD },
    ],
  },
  {
    module: "M6 · Đánh giá & KPI",
    features: [
      { key: "m6.mau", label: "Kỳ & mẫu KPI", actions: CRUD },
      { key: "m6.chamdiem", label: "Chấm điểm / Đánh giá", actions: ["view", "create", "edit", "approve"] },
      { key: "m6.tinh", label: "Tính KPI", actions: ["run"] },
    ],
  },
  {
    module: "M7 · Lương & BHXH",
    features: [
      { key: "m7.bangluong", label: "Bảng lương", actions: ["view", "run", "approve"] },
      { key: "m7.phieuluong", label: "Phiếu lương (cá nhân)", actions: ["view"] },
      { key: "m7.dieuchinh", label: "Điều chỉnh lương", actions: CRUD },
      { key: "m7.thuongan", label: "Thưởng ăn ca", actions: CRU },
      { key: "m7.dongia", label: "Đơn giá khoán", actions: CRUD },
      { key: "m7.bhxh", label: "BHXH", actions: ["view"] },
    ],
  },
  {
    module: "M8 · Kỷ luật & Quy định",
    features: [
      { key: "m8.kyluat", label: "Quyết định kỷ luật", actions: CRUD },
      { key: "m8.quydinh", label: "Quy định / Nội quy", actions: CRUD },
    ],
  },
  {
    module: "M9 · HSE An toàn",
    features: [
      { key: "m9.suco", label: "Sự cố an toàn", actions: CRUD },
      { key: "m9.ppe", label: "PPE — Bảo hộ", actions: CRU },
      { key: "m9.huanluyen", label: "Huấn luyện an toàn", actions: CRU },
      { key: "m9.briefing", label: "Họp an toàn (briefing)", actions: CRU },
      { key: "m9.5s", label: "5S Audit", actions: CRU },
      { key: "m9.ncr", label: "NCR — Điểm không phù hợp", actions: CRU },
    ],
  },
  {
    module: "M10 · Hành chính",
    features: [
      // Quản lý xe
      { key: "m10.xe.datxe", label: "Đặt xe (công tác)", group: "Quản lý xe", actions: ["view", "create", "edit", "delete", "approve1", "approve2"] },
      { key: "m10.xe.doixe", label: "Đội xe", group: "Quản lý xe", actions: CRUD },
      { key: "m10.xe.nhienlieu", label: "Nhiên liệu", group: "Quản lý xe", actions: VC },
      { key: "m10.xe.baotri", label: "Bảo trì", group: "Quản lý xe", actions: VC },
      // Phòng họp
      { key: "m10.phonghop.dat", label: "Đặt phòng họp", group: "Phòng họp", actions: ["view", "create", "delete", "approve"] },
      { key: "m10.phonghop.danhmuc", label: "Danh mục phòng", group: "Phòng họp", actions: CRUD },
      // Văn phòng phẩm
      { key: "m10.vpp.denghi", label: "Đề nghị VPP", group: "Văn phòng phẩm", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "m10.vpp.danhmuc", label: "Danh mục VPP", group: "Văn phòng phẩm", actions: CRU },
      { key: "m10.vpp.nhapkho", label: "Nhập kho VPP", group: "Văn phòng phẩm", actions: ["create"] },
      { key: "m10.vpp.ncc", label: "Nhà cung cấp", group: "Văn phòng phẩm", actions: CRU },
      { key: "m10.vpp.baocao", label: "Báo cáo sử dụng VPP", group: "Văn phòng phẩm", actions: ["view"] },
      // Nhà ăn
      { key: "m10.nhaan.dangky", label: "Đăng ký suất ăn", group: "Nhà ăn", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "m10.nhaan.chiphi", label: "Chi phí thực phẩm", group: "Nhà ăn", actions: CRUD },
      { key: "m10.nhaan.thucxuat", label: "Thực xuất", group: "Nhà ăn", actions: ["view", "edit", "delete"] },
      { key: "m10.nhaan.thucte", label: "Suất thực tế", group: "Nhà ăn", actions: ["view", "edit"] },
      { key: "m10.nhaan.thucdon", label: "Thực đơn tuần", group: "Nhà ăn", actions: CRUD },
      { key: "m10.nhaan.thaufu", label: "Nhà thầu phụ", group: "Nhà ăn", actions: CRUD },
      // Còn lại
      { key: "m10.vesinh", label: "Vệ sinh", group: "Khác", actions: CRUD },
      { key: "m10.khach", label: "Đăng ký khách", group: "Khác", actions: ["view", "create", "approve"] },
      { key: "m10.sukien", label: "Sự kiện", group: "Khác", actions: CRUD },
      { key: "m10.congvan", label: "Công văn đến / đi", group: "Khác", actions: CRUD },
    ],
  },
  {
    module: "Hệ thống",
    features: [
      { key: "sys.phanquyen", label: "Phân quyền & tài khoản", actions: CRUD },
      { key: "sys.audit", label: "Audit Log", actions: ["view"] },
      { key: "sys.baocao", label: "Báo cáo hoạt động", actions: ["view"] },
    ],
  },
];

// Tất cả ô quyền hợp lệ ("feature:action") — để validate & dựng template.
export const ALL_PERMS: string[] = PERMISSION_CATALOG.flatMap((g) =>
  g.features.flatMap((f) => f.actions.map((a) => `${f.key}:${a}`))
);

// Helper dựng template
const permsWhere = (pred: (feat: Feature, action: Action) => boolean): string[] =>
  PERMISSION_CATALOG.flatMap((g) =>
    g.features.flatMap((f) => f.actions.filter((a) => pred(f, a)).map((a) => `${f.key}:${a}`))
  );

// ── Nhóm quyền mẫu (map theo role hiện có để không phá dữ liệu cũ) ────────────
export type PermTemplate = { label: string; perms: Set<string> };

export const PERMISSION_TEMPLATES: Record<string, PermTemplate> = {
  ADMIN: { label: "Toàn quyền (Quản trị HT)", perms: new Set(ALL_PERMS) },
  // BGĐ chỉ XEM mọi thứ (mọi action bắt đầu bằng "view").
  BOM: { label: "Ban Giám đốc — chỉ XEM", perms: new Set(permsWhere((_f, a) => a === "view")) },
  // HCNS: toàn quyền nghiệp vụ (trừ module Hệ thống).
  HR_ADMIN: { label: "HC Nhân sự — toàn quyền nghiệp vụ", perms: new Set(permsWhere((f) => !f.key.startsWith("sys."))) },
  MANAGER: {
    label: "Trưởng bộ phận — dept của mình",
    perms: new Set([
      "m1.hoso:view", "m2.sodo:view",
      "m3.nghiphep:view", "m3.nghiphep:approve1",           // TP duyệt cấp 1 nghỉ phép
      "m3.tangca:view", "m3.tangca:approve",
      "m10.xe.datxe:view", "m10.xe.datxe:create", "m10.xe.datxe:approve1",
      "m10.phonghop.dat:view", "m10.phonghop.dat:create",
      "m10.vpp.denghi:view", "m10.vpp.denghi:create",
      "m10.nhaan.dangky:view", "m10.nhaan.dangky:create",
    ]),
  },
  TEAM_LEAD: {
    label: "Tổ trưởng",
    perms: new Set(["m1.hoso:view", "m3.tangca:view", "m3.tangca:approve"]),
  },
  EMPLOYEE: {
    label: "Nhân viên — cơ bản",
    perms: new Set([
      "m1.hoso:view", "m2.sodo:view",
      "m3.nghiphep:view", "m3.nghiphep:create", "m3.tangca:view", "m3.tangca:create",
      "m5.daotao:view", "m7.phieuluong:view",
      "m10.xe.datxe:view", "m10.xe.datxe:create",
      "m10.phonghop.dat:view", "m10.phonghop.dat:create",
      "m10.nhaan.dangky:view", "m10.nhaan.dangky:create",
    ]),
  },
};

/** Danh sách "feature:action" mặc định của 1 Nhóm quyền (role). */
export function templatePerms(role: string): Set<string> {
  return PERMISSION_TEMPLATES[role]?.perms ?? new Set();
}

// ── Quyền hiệu lực của 1 account ─────────────────────────────────────────────
//   - ADMIN = superset (mọi quyền).
//   - storedGrants là mảng (kể cả RỖNG) → account có ma trận riêng → dùng đúng nó ([] = khóa sạch).
//   - storedGrants == null → chưa tùy chỉnh riêng → dùng gói mẫu của Nhóm quyền (role).
export function effectivePerms(role: string, storedGrants?: string[] | null): Set<string> {
  if (role === "ADMIN") return new Set(ALL_PERMS);
  if (storedGrants != null) return new Set(storedGrants);
  return templatePerms(role);
}

/** Kiểm tra 1 quyền cụ thể ("feature:action"). */
export function can(role: string, storedGrants: string[] | null | undefined, perm: string): boolean {
  if (role === "ADMIN") return true;
  return effectivePerms(role, storedGrants).has(perm);
}

// Kiểm tra quyền từ session user (role + perms đã tính sẵn ở JWT). Dùng trong API route.
// perms là MẢNG (kể cả rỗng) → dùng đúng nó (đã tính ở login, [] = khóa sạch).
// perms KHÔNG phải mảng (undefined — session cũ chưa có field) → fallback gói mẫu để không chặn nhầm.
export function canUser(user: { role?: string | null; perms?: string[] | null } | null | undefined, perm: string): boolean {
  const role = user?.role ?? "";
  if (role === "ADMIN") return true;
  const stored = user?.perms;
  const set = Array.isArray(stored) ? new Set(stored) : templatePerms(role);
  return set.has(perm);
}
