// Xử lý 2 cặp trùng tên trong đối soát công T4:
//
// Ca 1 — Nguyễn Văn Quân:
//   - IBS-365 (erpCode 190763) = người GIÁN TIẾP, Phòng thiết kế (P. Kỹ thuật).
//     Hiện DB gán nhầm P. Sản xuất / tổ Gá lắp 3 (do reassign-departments trước
//     name-match nhầm sang dữ liệu của 190848). → Sửa về P. Kỹ thuật, bỏ tổ.
//   - 190848 = người TRỰC TIẾP, tổ Gá lắp 3, KHÔNG có trong DB → tạo NV mới.
//
// Ca 2 — Nguyễn Quốc Huy (anh sontt xác nhận: 2 người khác nhau):
//   - IBS-320 (erpCode 190897) = giữ nguyên.
//   - 190863 = người thứ 2 cùng Phòng thiết kế, KHÔNG có trong DB → tạo NV mới.
//
// Chạy: npx tsx --env-file=.env scripts/fix-ca1-quan.ts          (dry-run)
//       npx tsx --env-file=.env scripts/fix-ca1-quan.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const APPLY = process.argv.includes("--apply");

const DEPT_SAN_XUAT = "92d578a4-7abc-4547-a32a-e99a6d675099";
const DEPT_KY_THUAT = "20677755-aa3a-48de-bc7a-bba8d0a718d3";
const TEAM_GA_LAP_3 = "4d23b629-a477-456f-93b0-de4739b5a2cc";

interface NewNV {
  erpCode: string;
  fullName: string;
  gender: "MALE" | "FEMALE";
  departmentId: string;
  teamId: string | null;
  emailBase: string; // local part trước @ibs.vn
}

const NEW_NV: NewNV[] = [
  // Ca 1
  { erpCode: "190848", fullName: "Nguyễn Văn Quân", gender: "MALE", departmentId: DEPT_SAN_XUAT, teamId: TEAM_GA_LAP_3, emailBase: "quan.n" },
  // Ca 2
  { erpCode: "190863", fullName: "Nguyễn Quốc Huy", gender: "MALE", departmentId: DEPT_KY_THUAT, teamId: null, emailBase: "huy.nq" },
];

async function pickPositionId(prisma: PrismaClient, departmentId: string): Promise<string> {
  let pos = await prisma.position.findFirst({ where: { departmentId, level: "WORKER" } });
  if (!pos) pos = await prisma.position.findFirst({ where: { departmentId } });
  if (!pos) throw new Error(`Không tìm thấy Position cho departmentId ${departmentId}`);
  return pos.id;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // ── 1. Sửa IBS-365 về P. Kỹ thuật ──
  const ibs365 = await prisma.employee.findFirst({
    where: { code: "IBS-365" },
    include: { department: { select: { name: true } }, team: { select: { name: true } }, user: { select: { erpCode: true } } },
  });
  if (!ibs365) {
    console.log("  ⚠️ Không tìm thấy IBS-365");
  } else {
    console.log(`\n1) IBS-365 ${ibs365.fullName} (erpCode ${ibs365.user?.erpCode}):`);
    console.log(`   phòng "${ibs365.department?.name}" → "P. Kỹ thuật"`);
    console.log(`   tổ    "${ibs365.team?.name ?? "—"}" → (bỏ tổ — gián tiếp)`);
    if (APPLY) {
      await prisma.employee.update({
        where: { id: ibs365.id },
        data: { departmentId: DEPT_KY_THUAT, teamId: null },
      });
      console.log("   ✅ Đã sửa");
    }
  }

  // ── 2. Tạo các NV mới ──
  console.log(`\n2) Tạo ${NEW_NV.length} NV mới:`);
  // Mã NV kế tiếp
  const maxRes: any[] = await prisma.$queryRawUnsafe(
    `SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num FROM "Employee" WHERE code LIKE 'IBS-%'`,
  );
  let nextNum = (Number(maxRes[0]?.max_num) || 0) + 1;
  // Cache positionId theo dept
  const posCache = new Map<string, string>();

  for (const nv of NEW_NV) {
    const exists = await prisma.user.findFirst({ where: { erpCode: nv.erpCode } });
    if (exists) {
      console.log(`   ⏭ erpCode ${nv.erpCode} đã tồn tại — skip`);
      continue;
    }
    const newCode = `IBS-${String(nextNum).padStart(3, "0")}`;
    nextNum++;
    const tag = nv.teamId ? "trực tiếp" : "gián tiếp";
    console.log(`   ➕ ${newCode} | ${nv.fullName} | erpCode ${nv.erpCode} | dept ${nv.departmentId === DEPT_SAN_XUAT ? "P. Sản xuất" : "P. Kỹ thuật"} | ${tag}`);

    if (APPLY) {
      if (!posCache.has(nv.departmentId)) posCache.set(nv.departmentId, await pickPositionId(prisma, nv.departmentId));
      const positionId = posCache.get(nv.departmentId)!;

      let email = `${nv.emailBase}@ibs.vn`;
      let suffix = 2;
      while (await prisma.user.findFirst({ where: { email } })) { email = `${nv.emailBase}${suffix}@ibs.vn`; suffix++; }
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
      await prisma.employee.create({
        data: {
          userId: newUser.id,
          code: newCode,
          fullName: nv.fullName,
          gender: nv.gender,
          dateOfBirth: new Date("1990-01-01"),
          idNumber: "000000000000",
          phone: "",
          address: "",
          departmentId: nv.departmentId,
          positionId,
          teamId: nv.teamId,
          startDate: new Date("2026-04-01"),
          status: "ACTIVE",
          dependents: 0,
        },
      });
      console.log(`     ✅ Đã tạo (email ${email}, mật khẩu tạm 123456)`);
    }
  }

  console.log(APPLY
    ? "\n✅ HOÀN TẤT. Anh import lại 2 file công (trực tiếp + gián tiếp) để công của 190848 + 190863 vào M3."
    : "\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
