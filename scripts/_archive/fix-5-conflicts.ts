// Xử lý 5 conflict erpCode:
//   1. Sửa IBS-1065 Nguyễn Đức Hiếu: erpCode 190840 → 190839 (DB ghi sai)
//   2. Tạo 4 NV mới (trùng tên nhưng khác người): 190116, 190035, 190134, 190833
//
// Chạy: npx tsx scripts/fix-5-conflicts.ts          (dry-run)
//       npx tsx scripts/fix-5-conflicts.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const APPLY = process.argv.includes("--apply");

const DEPT_SAN_XUAT_ID = "92d578a4-7abc-4547-a32a-e99a6d675099";
const TEAM = {
  "Gá lắp 1": "28c1d263-2936-4405-a68b-03a680d1113e",
  "Hàn 2": "3d13a177-1896-4a22-b6ff-519251cbcee3",
  "Sơn": "9bf5d8c6-1e7b-4dd0-9157-9b8df6aa8c95",
  "Tổ Cơ giới": "18cd43bf-1b4c-4e95-b261-03e4683e8edc",
};

// 4 NV mới — data tổng hợp từ các file Excel
const NEW_NV = [
  { erpCode: "190116", fullName: "Nguyễn Văn Huy", teamName: "Gá lắp 1", chucDanh: "Thợ sắt", baseSalary: 5966000, idNumber: "", taxCode: "" },
  { erpCode: "190035", fullName: "Nguyễn Văn Huy", teamName: "Tổ Cơ giới", chucDanh: "Thợ lái xe", baseSalary: 5966000, idNumber: "031073003473", taxCode: "8025282103" },
  { erpCode: "190134", fullName: "Nguyễn Thị Thúy", teamName: "Hàn 2", chucDanh: "Phụ Hàn", baseSalary: 5576000, idNumber: "031179001083", taxCode: "8359221269" },
  { erpCode: "190833", fullName: "Nguyễn Thị Nga", teamName: "Sơn", chucDanh: "Thợ sơn", baseSalary: 0, idNumber: "", taxCode: "" },
];

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // ── 1. Sửa erpCode IBS-1065 ──
  const hieu = await prisma.employee.findFirst({
    where: { code: "IBS-1065" },
    include: { user: { select: { id: true, erpCode: true } } },
  });
  if (!hieu) {
    console.log("  ⚠️ Không tìm thấy IBS-1065");
  } else {
    console.log(`\n1) IBS-1065 ${hieu.fullName}: erpCode ${hieu.user?.erpCode} → 190839`);
    if (APPLY) {
      // Check 190839 chưa bị ai chiếm
      const clash = await prisma.user.findFirst({ where: { erpCode: "190839" } });
      if (clash) {
        console.log("   ⚠️ 190839 đã tồn tại — skip");
      } else {
        await prisma.user.update({ where: { id: hieu.user!.id }, data: { erpCode: "190839" } });
        console.log("   ✅ Đã sửa");
      }
    }
  }

  // ── 2. Tạo 4 NV mới ──
  console.log(`\n2) Tạo 4 NV mới:`);
  // Lấy positionId mặc định trong P. Sản xuất (ưu tiên WORKER)
  let defaultPos = await prisma.position.findFirst({
    where: { departmentId: DEPT_SAN_XUAT_ID, level: "WORKER" },
  });
  if (!defaultPos) defaultPos = await prisma.position.findFirst({ where: { departmentId: DEPT_SAN_XUAT_ID } });
  if (!defaultPos) throw new Error("Không tìm thấy Position trong P. Sản xuất");

  // Mã NV kế tiếp
  const maxRes: any[] = await prisma.$queryRawUnsafe(
    `SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num FROM "Employee" WHERE code LIKE 'IBS-%'`,
  );
  let nextNum = (Number(maxRes[0]?.max_num) || 0) + 1;

  for (const nv of NEW_NV) {
    // Skip nếu erpCode đã tồn tại
    const exists = await prisma.user.findFirst({ where: { erpCode: nv.erpCode } });
    if (exists) {
      console.log(`   ⏭ ${nv.erpCode} ${nv.fullName} — đã tồn tại, skip`);
      continue;
    }
    const newCode = `IBS-${String(nextNum).padStart(3, "0")}`;
    nextNum++;
    const teamId = (TEAM as Record<string, string>)[nv.teamName];
    console.log(`   ➕ ${newCode} | ${nv.fullName} | erpCode ${nv.erpCode} | Tổ ${nv.teamName} | ${nv.chucDanh} | lương ${nv.baseSalary.toLocaleString("vi-VN")}`);

    if (APPLY) {
      // Email
      const nameClean = nv.fullName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, "").trim().split(/\s+/);
      const emailBase = (nameClean[nameClean.length - 1] || "nv") + "." + (nameClean[0]?.charAt(0) || "x");
      let email = `${emailBase}@ibs.vn`;
      let suffix = 2;
      while (await prisma.user.findFirst({ where: { email } })) {
        email = `${emailBase}${suffix}@ibs.vn`;
        suffix++;
      }
      const tempHash = await hash("123456", 10);
      const newUser = await prisma.user.create({
        data: {
          employeeCode: newCode,
          erpCode: nv.erpCode,
          email,
          passwordHash: tempHash,
          role: "EMPLOYEE",
          isActive: true,
          forcePasswordChange: true,
        },
      });
      const newEmp = await prisma.employee.create({
        data: {
          userId: newUser.id,
          code: newCode,
          fullName: nv.fullName,
          gender: nv.fullName.includes("Thị") ? "FEMALE" : "MALE",
          dateOfBirth: new Date("1990-01-01"),
          idNumber: nv.idNumber || "000000000000",
          phone: "",
          address: "",
          departmentId: DEPT_SAN_XUAT_ID,
          positionId: defaultPos.id,
          teamId: teamId || null,
          startDate: new Date("2026-04-01"),
          status: "ACTIVE",
          taxCode: nv.taxCode || null,
          dependents: 0,
        },
      });
      // Contract nếu có lương
      if (nv.baseSalary > 0) {
        await prisma.contract.create({
          data: {
            employeeId: newEmp.id,
            contractNumber: `BACKFILL-${nv.erpCode}`,
            contractType: "INDEFINITE",
            position: nv.chucDanh,
            startDate: new Date("2026-04-01"),
            endDate: null,
            baseSalary: nv.baseSalary,
            insuranceSalary: nv.baseSalary,
            status: "ACTIVE",
          },
        });
      }
    }
  }

  console.log(APPLY ? "\n✅ HOÀN TẤT" : "\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
