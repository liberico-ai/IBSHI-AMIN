// ════════════════════════════════════════════════════════════════════════════
// DANH MỤC QUYỀN — dùng cho ma trận phân quyền (Nhóm quyền + tick chi tiết).
//   - PERMISSION_CATALOG: toàn bộ module × tính năng × hành động (để vẽ ma trận).
//   - PERMISSION_TEMPLATES: các "Nhóm quyền" mẫu (tick sẵn theo gói).
//   - Quyền hiệu lực = quyền của Nhóm quyền  ⊕  ghi đè riêng (AccessGrant) của account.
// Định danh 1 ô quyền = `${feature.key}:${action}`  (vd "m1.hoso:edit").
// ════════════════════════════════════════════════════════════════════════════

export type Action = "view" | "create" | "edit" | "delete" | "approve";

export const ACTION_LABELS: Record<Action, string> = {
  view: "Xem",
  create: "Thêm",
  edit: "Sửa",
  delete: "Xóa",
  approve: "Duyệt",
};

export type Feature = {
  key: string;        // định danh duy nhất, vd "m1.hoso"
  label: string;      // "Hồ sơ nhân sự"
  actions: Action[];  // các hành động áp dụng cho tính năng này
};

export type ModuleGroup = {
  module: string;     // nhãn nhóm module hiển thị trên ma trận
  features: Feature[];
};

const CRUD: Action[] = ["view", "create", "edit", "delete"];

export const PERMISSION_CATALOG: ModuleGroup[] = [
  {
    module: "M1 · Hồ sơ nhân sự",
    features: [
      { key: "m1.hoso", label: "Hồ sơ nhân sự", actions: ["view", "create", "edit", "delete"] },
      { key: "m1.luonghd", label: "Lương / Hợp đồng (trong hồ sơ)", actions: ["view", "edit"] },
    ],
  },
  {
    module: "M2 · Sơ đồ tổ chức",
    features: [
      { key: "m2.sodo", label: "Sơ đồ tổ chức", actions: ["view", "edit"] },
    ],
  },
  {
    module: "M3 · Chấm công",
    features: [
      { key: "m3.bangcong", label: "Bảng chấm công", actions: ["view", "edit"] },
      { key: "m3.nghiphep", label: "Nghỉ phép", actions: ["view", "create", "approve"] },
      { key: "m3.tangca", label: "Tăng ca (OT)", actions: ["view", "create", "approve"] },
    ],
  },
  {
    module: "M4 · Tuyển dụng",
    features: [{ key: "m4.tuyendung", label: "Tuyển dụng", actions: CRUD }],
  },
  {
    module: "M5 · Đào tạo",
    features: [{ key: "m5.daotao", label: "Đào tạo & Chứng chỉ", actions: ["view", "create", "edit"] }],
  },
  {
    module: "M6 · Đánh giá & KPI",
    features: [{ key: "m6.kpi", label: "Đánh giá & KPI", actions: ["view", "edit"] }],
  },
  {
    module: "M7 · Lương & BHXH",
    features: [{ key: "m7.luong", label: "Lương & BHXH", actions: ["view", "edit", "approve"] }],
  },
  {
    module: "M8 · Kỷ luật & Quy định",
    features: [{ key: "m8.kyluat", label: "Kỷ luật & Quy định", actions: CRUD }],
  },
  {
    module: "M9 · HSE An toàn",
    features: [{ key: "m9.hse", label: "HSE An toàn", actions: ["view", "create", "edit", "approve"] }],
  },
  {
    module: "M10 · Hành chính",
    features: [
      { key: "m10.phonghop", label: "Phòng họp", actions: ["view", "create", "approve"] },
      { key: "m10.xe", label: "Quản lý xe", actions: ["view", "create", "approve"] },
      { key: "m10.vpp", label: "Văn phòng phẩm", actions: ["view", "create", "approve"] },
      { key: "m10.nhaan", label: "Nhà ăn", actions: ["view", "create", "edit"] },
      { key: "m10.vesinh", label: "Vệ sinh", actions: ["view", "create", "edit"] },
      { key: "m10.khach", label: "Đăng ký khách", actions: ["view", "create", "approve"] },
      { key: "m10.sukien", label: "Sự kiện", actions: ["view", "create", "edit"] },
      { key: "m10.congvan", label: "Công văn đến/đi", actions: ["view", "create", "edit"] },
    ],
  },
  {
    module: "Hệ thống",
    features: [
      { key: "sys.phanquyen", label: "Phân quyền & tài khoản", actions: ["view", "edit"] },
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
  BOM: { label: "Ban Giám đốc — chỉ XEM", perms: new Set(permsWhere((_f, a) => a === "view")) },
  HR_ADMIN: { label: "HC Nhân sự — toàn quyền nghiệp vụ", perms: new Set(permsWhere((f) => !f.key.startsWith("sys."))) },
  MANAGER: {
    label: "Trưởng bộ phận — dept của mình",
    perms: new Set([
      "m1.hoso:view", "m2.sodo:view",
      "m3.nghiphep:view", "m3.nghiphep:approve", "m3.tangca:view", "m3.tangca:approve",
      "m10.phonghop:view", "m10.phonghop:create", "m10.xe:view", "m10.xe:create",
      "m10.vpp:view", "m10.vpp:create", "m10.nhaan:view", "m10.nhaan:create",
    ]),
  },
  TEAM_LEAD: {
    label: "Tổ trưởng",
    perms: new Set(["m1.hoso:view", "m3.tangca:view", "m3.tangca:approve"]),
  },
  EMPLOYEE: {
    label: "Nhân viên — cơ bản",
    perms: new Set([
      "m1.hoso:view", "m2.sodo:view", "m3.nghiphep:view", "m3.nghiphep:create",
      "m3.tangca:view", "m3.tangca:create", "m5.daotao:view", "m7.luong:view",
      "m10.phonghop:view", "m10.phonghop:create", "m10.xe:view", "m10.xe:create",
      "m10.nhaan:view", "m10.nhaan:create",
    ]),
  },
};

/** Danh sách "feature:action" mặc định của 1 Nhóm quyền (role). */
export function templatePerms(role: string): Set<string> {
  return PERMISSION_TEMPLATES[role]?.perms ?? new Set();
}

// ── Quyền hiệu lực của 1 account ─────────────────────────────────────────────
// Quy tắc:
//   - ADMIN = superset (mọi quyền), không cần lưu grant.
//   - Nếu account CÓ ma trận riêng đã lưu (storedGrants) → dùng đúng ma trận đó
//     (đây là kết quả admin đã tick/bỏ tick, đè lên gói mẫu).
//   - Nếu CHƯA tùy chỉnh riêng (storedGrants rỗng) → dùng gói mẫu của Nhóm quyền (role).
//   - storedGrants == null  → CHƯA tùy chỉnh riêng → dùng gói mẫu (role).
//   - storedGrants là mảng (kể cả RỖNG) → account có ma trận riêng → dùng đúng nó.
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
