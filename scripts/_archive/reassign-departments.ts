// Set lại Department + ProductionTeam cho toàn bộ NV từ 3 file công tháng 4
//   - danh sách ns trực tiếp.xlsx  → NV trực tiếp (P. Sản xuất + team theo "Tổ")
//   - công t4 gián tiếp.xlsx       → NV gián tiếp (department theo "Tên tổ")
//   - "Tổ cơ giới" trong file gián tiếp → thực ra là TRỰC TIẾP (P. Sản xuất + Tổ Cơ giới)
//   - NV không có trong file nào → giữ nguyên
//
// Chạy: npx tsx scripts/reassign-departments.ts          (dry-run)
//       npx tsx scripts/reassign-departments.ts --apply
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DIR = "C:/Users/sontt/Downloads/Công tháng 4/";
const F_TRUCTIEP_LIST = DIR + "danh sách ns trực tiếp.xlsx";
const F_GIANTIEP = DIR + "công t4 gián tiếp.xlsx";
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-reassign-department.xlsx";
const APPLY = process.argv.includes("--apply");

// "Tổ" trong khối trực tiếp → tên ProductionTeam trong DB
const TO_TO_TEAM: Record<string, string> = {
  "GCCK": "GCCK",
  "GL 1": "Gá lắp 1", "GL 2": "Gá lắp 2", "GL 3": "Gá lắp 3", "GL 4": "Gá lắp 4", "GL 5": "Gá lắp 5",
  "HÀN 1": "Hàn 1", "HÀN 2": "Hàn 2", "HAN 1": "Hàn 1", "HAN 2": "Hàn 2",
  "PC 2": "Pha cắt 2", "PC 3": "Pha cắt 3",
  "SƠN": "Sơn", "SON": "Sơn",
  "TH": "Tổng hợp",
  "TỔ CƠ GIỚI": "Tổ Cơ giới",
};

// "Tên tổ" trong khối gián tiếp → tên Department trong DB
const TENTO_TO_DEPT: Record<string, string> = {
  "BAN GIÁM ĐỐC": "Ban Giám đốc",
  "PHÒNG HCNS": "P. HCNS",
  "PHÒNG TC KTOAN": "P. Kế toán",
  "PHÒNG KINH DOANH": "P. Kinh doanh",
  "PHÒNG THƯƠNG MẠI": "P. Thương mại",
  "PHÒNG TRANG THIẾT BỊ": "P. Thiết bị",
  "PHÒNG CHẤT LƯỢNG": "P. QAQC",
  "PHÒNG THIẾT KẾ": "P. Kỹ thuật",
  "PHÒNG DỰ ÁN": "P. QLDA",
  "PHÒNG QUẢN LÝ SẢN XUẤT": "P. Sản xuất",
  "PHÒNG KINH TẾ KẾ HOẠCH": "P. Kinh tế kế hoạch", // tạo mới
  "BỘ PHẬN KHO": "P. Kho", // tạo mới
  // "TỔ CƠ GIỚI" → xử lý riêng (trực tiếp)
};

const NEW_DEPTS = ["P. Kinh tế kế hoạch", "P. Kho"];
const DEPT_SAN_XUAT = "P. Sản xuất";

function norm(s: string): string {
  return String(s).trim().toUpperCase().replace(/\s+/g, " ");
}
function normName(s: string): string {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  // ── Đọc 3 file ──
  // 1. Danh sách trực tiếp: maNV → tổ
  const wb1 = XLSX.readFile(F_TRUCTIEP_LIST);
  const d1 = XLSX.utils.sheet_to_json<any[]>(wb1.Sheets["Danh sách"], { header: 1, defval: "", raw: true });
  const trucTiep = new Map<string, { name: string; to: string }>();
  for (let r = 1; r < d1.length; r++) {
    const ma = String(d1[r][1] || "").trim();
    if (!/^\d+$/.test(ma)) continue;
    trucTiep.set(ma, { name: String(d1[r][2] || "").trim(), to: String(d1[r][3] || "").trim() });
  }

  // 2. Gián tiếp: maNV → tên tổ
  const wb2 = XLSX.readFile(F_GIANTIEP);
  const d2 = XLSX.utils.sheet_to_json<any[]>(wb2.Sheets["T04-2026-GIÁN TIẾP VP"], { header: 1, defval: "", raw: true });
  const gianTiep = new Map<string, { name: string; tenTo: string }>();
  for (let r = 6; r < d2.length; r++) {
    const ma = String(d2[r][1] || "").trim();
    if (!/^\d+$/.test(ma)) continue;
    if (!gianTiep.has(ma)) {
      gianTiep.set(ma, { name: String(d2[r][2] || "").trim(), tenTo: String(d2[r][3] || "").trim() });
    }
  }

  console.log(`Trực tiếp list: ${trucTiep.size} NV | Gián tiếp file: ${gianTiep.size} NV`);

  // ── Connect DB ──
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Tạo 2 Department mới nếu chưa có
  if (APPLY) {
    for (const dn of NEW_DEPTS) {
      const exists = await prisma.department.findFirst({ where: { name: dn } });
      if (!exists) {
        // Department code unique — strip dấu tiếng Việt
        const code = dn
          .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d")
          .replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase() + Date.now().toString().slice(-4);
        await prisma.department.create({ data: { name: dn, code, headcount: 0 } });
        console.log(`  ➕ Tạo Department: ${dn} (code: ${code})`);
      }
    }
  }

  const depts = await prisma.department.findMany({ select: { id: true, name: true } });
  const teams = await prisma.productionTeam.findMany({ select: { id: true, name: true } });
  const deptByName = new Map(depts.map((d) => [d.name, d]));
  const teamByName = new Map(teams.map((t) => [t.name, t]));

  const dbEmps = await prisma.employee.findMany({
    include: {
      user: { select: { erpCode: true } },
      department: { select: { name: true } },
      team: { select: { name: true } },
    },
  });
  const dbByErp = new Map<string, (typeof dbEmps)[number]>();
  const dbByName = new Map<string, (typeof dbEmps)[number][]>();
  for (const e of dbEmps) {
    if (e.user?.erpCode) dbByErp.set(e.user.erpCode, e);
    const nn = normName(e.fullName);
    if (!dbByName.has(nn)) dbByName.set(nn, []);
    dbByName.get(nn)!.push(e);
  }

  function findEmp(maNV: string, name: string) {
    let e = dbByErp.get(maNV);
    if (e) return { e, by: "erpCode" };
    const cands = dbByName.get(normName(name));
    if (cands && cands.length === 1) return { e: cands[0], by: "tên" };
    if (cands && cands.length > 1) return { e: cands[0], by: "tên (trùng)" };
    return null;
  }

  // ── Build plan ──
  const plan: any[] = [];
  const notMatched: any[] = [];
  const unmappedTo: any[] = [];
  const usedIds = new Set<string>();

  // Gộp tất cả maNV cần xử lý
  const allTargets = new Map<string, { name: string; loai: "TRỰC TIẾP" | "GIÁN TIẾP"; toOrTenTo: string }>();

  // Trực tiếp (từ danh sách)
  for (const [ma, info] of trucTiep) {
    allTargets.set(ma, { name: info.name, loai: "TRỰC TIẾP", toOrTenTo: info.to });
  }
  // Gián tiếp (từ file công gián tiếp) — trừ "Tổ cơ giới" → coi là trực tiếp
  for (const [ma, info] of gianTiep) {
    if (allTargets.has(ma)) continue; // đã là trực tiếp
    if (norm(info.tenTo) === "TỔ CƠ GIỚI") {
      allTargets.set(ma, { name: info.name, loai: "TRỰC TIẾP", toOrTenTo: "Tổ cơ giới" });
    } else {
      allTargets.set(ma, { name: info.name, loai: "GIÁN TIẾP", toOrTenTo: info.tenTo });
    }
  }

  for (const [maNV, t] of allTargets) {
    const found = findEmp(maNV, t.name);
    if (!found) {
      notMatched.push({ "Mã NV": maNV, "Họ tên": t.name, "Loại": t.loai, "Tổ/Phòng": t.toOrTenTo });
      continue;
    }
    if (usedIds.has(found.e.id)) continue;
    usedIds.add(found.e.id);

    let newDeptName: string | null = null;
    let newTeamName: string | null = null;

    if (t.loai === "TRỰC TIẾP") {
      newDeptName = DEPT_SAN_XUAT;
      const teamMapped = TO_TO_TEAM[norm(t.toOrTenTo)];
      if (!teamMapped) {
        unmappedTo.push({ "Mã NV": maNV, "Họ tên": t.name, "Tổ Excel": t.toOrTenTo, "Lỗi": "Không map được Tổ → ProductionTeam" });
        continue;
      }
      newTeamName = teamMapped;
    } else {
      const deptMapped = TENTO_TO_DEPT[norm(t.toOrTenTo)];
      if (!deptMapped) {
        unmappedTo.push({ "Mã NV": maNV, "Họ tên": t.name, "Tên tổ Excel": t.toOrTenTo, "Lỗi": "Không map được Tên tổ → Department" });
        continue;
      }
      newDeptName = deptMapped;
      newTeamName = null; // gián tiếp không có team
    }

    const newDept = deptByName.get(newDeptName!);
    const newTeam = newTeamName ? teamByName.get(newTeamName) : null;
    if (!newDept) {
      unmappedTo.push({ "Mã NV": maNV, "Họ tên": t.name, "Lỗi": `Department "${newDeptName}" chưa tồn tại trong DB (cần --apply để tạo)` });
      continue;
    }
    if (newTeamName && !newTeam) {
      unmappedTo.push({ "Mã NV": maNV, "Họ tên": t.name, "Lỗi": `ProductionTeam "${newTeamName}" không có trong DB` });
      continue;
    }

    const changed = found.e.departmentId !== newDept.id || found.e.teamId !== (newTeam?.id || null);
    plan.push({
      empId: found.e.id,
      "Mã NV": found.e.code,
      "Họ tên": found.e.fullName,
      "Match": found.by,
      "Loại": t.loai,
      "Phòng CŨ": found.e.department?.name || "—",
      "Tổ CŨ": found.e.team?.name || "—",
      "Phòng MỚI": newDeptName,
      "Tổ MỚI": newTeamName || "—",
      "Thay đổi?": changed ? "✓" : "(giữ nguyên)",
      _newDeptId: newDept.id,
      _newTeamId: newTeam?.id || null,
    });
  }

  // NV trong DB không có trong file nào → giữ nguyên (chỉ liệt kê)
  const dbNotInFiles = dbEmps
    .filter((e) => !usedIds.has(e.id) && ["ACTIVE", "PROBATION", "ON_LEAVE"].includes(e.status))
    .map((e) => ({ "Mã NV": e.code, "Họ tên": e.fullName, "Phòng hiện tại": e.department?.name || "—" }));

  const willChange = plan.filter((p) => p["Thay đổi?"] === "✓");

  console.log(`\n📊 Kết quả:`);
  console.log(`  Tổng NV trong file: ${allTargets.size}`);
  console.log(`  Match + map được: ${plan.length}`);
  console.log(`     ↳ Sẽ thay đổi phòng/tổ: ${willChange.length}`);
  console.log(`     ↳ Giữ nguyên (đã đúng): ${plan.length - willChange.length}`);
  console.log(`  KHÔNG match DB: ${notMatched.length}`);
  console.log(`  Không map được Tổ/Phòng: ${unmappedTo.length}`);
  console.log(`  NV trong DB không có trong file (giữ nguyên): ${dbNotInFiles.length}`);

  if (APPLY) {
    console.log(`\n🚀 Đang apply ${willChange.length} thay đổi...`);
    for (const p of willChange) {
      await prisma.employee.update({
        where: { id: p.empId },
        data: { departmentId: p._newDeptId, teamId: p._newTeamId },
      });
    }
    console.log(`  ✅ Updated ${willChange.length} Employee`);
  }

  // Output
  const wbOut = XLSX.utils.book_new();
  const summary = [
    { Mục: "Mode", "Giá trị": APPLY ? "APPLY" : "DRY-RUN" },
    { Mục: "Tổng NV trong file", "Giá trị": allTargets.size },
    { Mục: "Match + map được", "Giá trị": plan.length },
    { Mục: "   ↳ Sẽ thay đổi", "Giá trị": willChange.length },
    { Mục: "   ↳ Giữ nguyên", "Giá trị": plan.length - willChange.length },
    { Mục: "KHÔNG match DB", "Giá trị": notMatched.length },
    { Mục: "Không map được Tổ/Phòng", "Giá trị": unmappedTo.length },
    { Mục: "NV DB không có trong file", "Giá trị": dbNotInFiles.length },
  ];
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(plan.map(({ empId, _newDeptId, _newTeamId, ...r }) => r)), "Phân phòng (chi tiết)");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(notMatched), "KHÔNG match DB");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(unmappedTo), "Không map được");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(dbNotInFiles), "DB không có trong file");

  let outPath = OUTPUT;
  try { XLSX.writeFile(wbOut, outPath); }
  catch (e: any) { if (e.code === "EBUSY") { outPath = OUTPUT.replace(".xlsx", `_${Date.now()}.xlsx`); XLSX.writeFile(wbOut, outPath); } else throw e; }
  console.log(`\n✅ Xuất: ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
