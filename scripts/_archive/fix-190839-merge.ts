// Sửa lỗi data merge giữa IBS-1065 (Nguyễn Đức Hiếu) và Vũ Phương Anh:
//
// File lương khách (master): 190839 = Vũ Phương Anh, 190840 = Nguyễn Đức Hiếu
// Lúc trước em sửa nhầm IBS-1065 erpCode 190840 → 190839, rồi tạo IBS-1234 = 190840
// → IBS-1065 và IBS-1234 thực ra là CÙNG 1 NGƯỜI (Nguyễn Đức Hiếu Tổ GCCK).
//
// Apply theo file lương = master:
//   1) IBS-1065 erpCode 190839 → 190840 + sync Contract từ row 190840 file lương
//   2) Xoá IBS-1234 (HĐ + Employee + User) — duplicate
//   3) Tạo NV mới cho Vũ Phương Anh erpCode 190839 + Contract từ row 190839 file lương
//
// Chạy: npx tsx --env-file=.env scripts/fix-190839-merge.ts          (dry-run)
//       npx tsx --env-file=.env scripts/fix-190839-merge.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const APPLY = process.argv.includes("--apply");
const F = "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls";
const DEPT_KY_THUAT = "20677755-aa3a-48de-bc7a-bba8d0a718d3";

function readSalaryRow(ma: string) {
  const wb = XLSX.readFile(F);
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const d = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: "", raw: true });
    for (let r = 9; r < d.length; r++) {
      if (String(d[r][1] ?? "").trim() === ma) {
        return {
          name: String(d[r][2] ?? "").trim(), dept: String(d[r][3] ?? "").trim(),
          chucDanh: String(d[r][4] ?? "").trim(),
          mucChinh: Number(d[r][12]) || 0,
          kpi: Number(d[r][16]) || 0,
          responsibility: Number(d[r][18]) || 0,
          xangXe: Number(d[r][19]) || 0,
          bh32: Number(d[r][88]) || 0,
        };
      }
    }
  }
  return null;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const row839 = readSalaryRow("190839");
  const row840 = readSalaryRow("190840");
  console.log(`File lương 190839: ${row839?.name} | ${row839?.dept} | mức chính ${row839?.mucChinh?.toLocaleString("vi-VN")} | KPI ${row839?.kpi?.toLocaleString("vi-VN")}`);
  console.log(`File lương 190840: ${row840?.name} | ${row840?.dept} | mức chính ${row840?.mucChinh?.toLocaleString("vi-VN")} | KPI ${row840?.kpi?.toLocaleString("vi-VN")}`);

  // ── B1. Xoá IBS-1234 trước (giải phóng erpCode 190840) ──
  console.log(`\n1) Xoá IBS-1234 (Nguyễn Đức Hiếu — duplicate của IBS-1065) để giải phóng erpCode 190840:`);
  const ibs1234 = await prisma.employee.findFirst({
    where: { code: "IBS-1234" },
    include: { user: true, contracts: true },
  });
  if (!ibs1234) console.log("   ⚠️ Không tìm thấy IBS-1234");
  else {
    console.log(`   Sẽ xoá: ${ibs1234.contracts.length} HĐ + Employee + User (${ibs1234.user?.email})`);
    if (APPLY) {
      const attDel = await prisma.attendanceRecord.deleteMany({ where: { employeeId: ibs1234.id } });
      if (attDel.count > 0) console.log(`   ✓ Xoá ${attDel.count} AttendanceRecord`);
      await prisma.contract.deleteMany({ where: { employeeId: ibs1234.id } });
      await prisma.employee.delete({ where: { id: ibs1234.id } });
      await prisma.user.delete({ where: { id: ibs1234.userId } });
      console.log("   ✅ Đã xoá");
    }
  }

  // ── B2. Đổi IBS-1065 erpCode 190839 → 190840 + sync Contract ──
  console.log(`\n2) IBS-1065 (Nguyễn Đức Hiếu): erpCode 190839 → 190840 + sync Contract từ row 190840`);
  const ibs1065 = await prisma.employee.findFirst({
    where: { code: "IBS-1065" },
    include: { user: true, contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1 } },
  });
  if (!ibs1065) console.log("   ⚠️ Không tìm thấy IBS-1065");
  else if (!row840) console.log("   ⚠️ Không có row 190840 trong file lương");
  else {
    const ct = ibs1065.contracts[0];
    const oldAllw = (ct?.allowances as any) || {};
    const newAllw: Record<string, any> = { ...oldAllw, kpi: row840.kpi };
    if (row840.responsibility > 0) newAllw.responsibility = row840.responsibility; else delete newAllw.responsibility;
    const newIns = row840.bh32 > 0 ? Math.round(row840.bh32 / 0.32) : row840.mucChinh;
    console.log(`   User.erpCode: ${ibs1065.user!.erpCode} → 190840`);
    console.log(`   Contract: baseSalary ${ct?.baseSalary?.toLocaleString("vi-VN")} → ${row840.mucChinh.toLocaleString("vi-VN")} | KPI ${(oldAllw.kpi || 0).toLocaleString("vi-VN")} → ${row840.kpi.toLocaleString("vi-VN")}`);
    if (APPLY) {
      await prisma.user.update({ where: { id: ibs1065.user!.id }, data: { erpCode: "190840" } });
      if (ct) {
        await prisma.contract.update({
          where: { id: ct.id },
          data: { baseSalary: row840.mucChinh, insuranceSalary: newIns, allowances: newAllw, position: row840.chucDanh },
        });
      }
      await prisma.employee.update({ where: { id: ibs1065.id }, data: { fuelHousingEligible: row840.xangXe > 0 } });
      console.log("   ✅ Đã sửa");
    }
  }

  // ── B3. Tạo Vũ Phương Anh erpCode 190839 + Contract ──
  console.log(`\n3) Tạo NV mới Vũ Phương Anh erpCode 190839:`);
  if (!row839) console.log("   ⚠️ Không có row 190839 trong file lương");
  else {
    const exists = await prisma.user.findFirst({ where: { erpCode: "190839" } });
    if (exists) console.log("   ⏭ erpCode 190839 vẫn còn ai đó giữ — skip (cần B1 xong trước)");
    else {
      const maxRes: any[] = await prisma.$queryRawUnsafe(
        `SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num FROM "Employee" WHERE code LIKE 'IBS-%'`,
      );
      const newCode = `IBS-${String((Number(maxRes[0]?.max_num) || 0) + 1).padStart(3, "0")}`;
      console.log(`   ➕ ${newCode} | ${row839.name} | erpCode 190839 | ${row839.dept} | ${row839.chucDanh} | mức chính ${row839.mucChinh.toLocaleString("vi-VN")} + KPI ${row839.kpi.toLocaleString("vi-VN")}`);

      if (APPLY) {
        let pos = await prisma.position.findFirst({ where: { departmentId: DEPT_KY_THUAT, level: "WORKER" } });
        if (!pos) pos = await prisma.position.findFirst({ where: { departmentId: DEPT_KY_THUAT } });
        if (!pos) throw new Error("Không tìm thấy Position trong P. Kỹ thuật");

        // Email theo tên
        const parts = row839.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z\s]/g, "").trim().split(/\s+/);
        const base = (parts[parts.length - 1] || "nv") + "." + (parts[0]?.charAt(0) || "x");
        let email = `${base}@ibs.vn`, suffix = 2;
        while (await prisma.user.findFirst({ where: { email } })) { email = `${base}${suffix}@ibs.vn`; suffix++; }
        const tempHash = await hash("123456", 10);
        const newUser = await prisma.user.create({
          data: { employeeCode: newCode, erpCode: "190839", email, passwordHash: tempHash, role: "EMPLOYEE", isActive: true, forcePasswordChange: true },
        });
        const isFemale = row839.name.includes("Thị") || row839.name.includes("Nữ") || row839.name.includes("Vũ Phương Anh");
        const newEmp = await prisma.employee.create({
          data: {
            userId: newUser.id, code: newCode, fullName: row839.name,
            gender: isFemale ? "FEMALE" : "MALE",
            dateOfBirth: new Date("1990-01-01"), idNumber: "000000000000", phone: "", address: "",
            departmentId: DEPT_KY_THUAT, positionId: pos.id, teamId: null,
            startDate: new Date("2026-04-01"), status: "ACTIVE", dependents: 0,
            fuelHousingEligible: row839.xangXe > 0,
          },
        });
        const allw: Record<string, any> = { kpi: row839.kpi };
        if (row839.responsibility > 0) allw.responsibility = row839.responsibility;
        const insSalary = row839.bh32 > 0 ? Math.round(row839.bh32 / 0.32) : row839.mucChinh;
        await prisma.contract.create({
          data: {
            employeeId: newEmp.id,
            contractNumber: `BACKFILL-LUONG-190839`,
            contractType: "INDEFINITE",
            position: row839.chucDanh,
            startDate: new Date("2026-04-01"), endDate: null,
            baseSalary: row839.mucChinh, insuranceSalary: insSalary,
            allowances: allw, status: "ACTIVE",
          },
        });
        console.log(`   ✅ Đã tạo ${newCode} (email ${email}, mật khẩu tạm 123456)`);
      }
    }
  }

  console.log(APPLY
    ? "\n✅ HOÀN TẤT — Anh báo khách: file công trực tiếp T4 ghi sai mã 190839 cho Nguyễn Đức Hiếu, đáng lẽ là 190840. Sau đó anh import lại file công + tạo lại kỳ T4."
    : "\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
