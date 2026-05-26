import prisma from "../src/lib/prisma";
import { hashSync } from "bcryptjs";

const APPLY = process.argv.includes("--apply");
const NEW = [
  { erp: "190886", name: "Lò Văn Trầm",     team: "Tổ Gá lắp 4", base: 5310000, allow: 3790000 },
  { erp: "190898", name: "Nguyễn Quang Hiệu", team: "Tổ Gá lắp 5", base: 5682000, allow: 7938000 },
  { erp: "190899", name: "Hà Văn Hoà",      team: "Tổ Hàn 1",    base: 5310000, allow: 3790000 },
  { erp: "190900", name: "Bùi Văn Trường",  team: "Tổ Gá lắp 5", base: 5310000, allow: 3790000 },
];
const PLACEHOLDER_DOB = new Date("1990-01-01");
const PLACEHOLDER_START = new Date("2026-01-01");

async function main(){
  const sx = await prisma.department.findFirst({ where: { name: "P. Sản xuất" } });
  if (!sx) throw new Error("Không thấy P. Sản xuất");
  const teams = await prisma.productionTeam.findMany({ where: { departmentId: sx.id } });
  const teamByName = new Map(teams.map(t=>[t.name, t.id]));

  // find-or-create position "Công nhân"
  let pos = await prisma.position.findFirst({ where: { departmentId: sx.id, name: "Công nhân" } });
  let lastC = (await prisma.contract.findFirst({ orderBy: { contractNumber: "desc" }, select: { contractNumber: true } }))?.contractNumber ?? "HD0000";
  let cnum = parseInt(lastC.replace(/\D/g,"")) || 1141;

  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");
  if (!pos) console.log(`Sẽ tạo position "Công nhân" trong P. Sản xuất`);
  if (APPLY && !pos) pos = await prisma.position.create({ data: { name: "Công nhân", departmentId: sx.id, level: "WORKER" } as any });

  for (const n of NEW) {
    const teamId = teamByName.get(n.team);
    cnum++;
    const cn = `HD${String(cnum).padStart(4,"0")}`;
    const exists = await prisma.user.findFirst({ where: { OR: [{ employeeCode: n.erp }, { erpCode: n.erp }] } });
    console.log(`\n${n.erp} ${n.name} | team=${n.team}(${teamId?"ok":"KHÔNG THẤY"}) | base=${n.base} allow=${n.allow} | HĐ=${cn}${exists?" | ĐÃ TỒN TẠI -> bỏ qua":""}`);
    if (!APPLY || exists || !teamId || !pos) continue;
    const user = await prisma.user.create({ data: {
      employeeCode: n.erp, erpCode: n.erp, email: `nv${n.erp}@ibs.com.vn`,
      passwordHash: hashSync("123456",10), role: "EMPLOYEE", isActive: true,
    }});
    const emp = await prisma.employee.create({ data: {
      userId: user.id, code: n.erp, fullName: n.name, gender: "MALE",
      dateOfBirth: PLACEHOLDER_DOB, idNumber: "", phone: "", address: "",
      departmentId: sx.id, positionId: pos.id, teamId, startDate: PLACEHOLDER_START,
    }});
    await prisma.contract.create({ data: {
      employeeId: emp.id, contractNumber: cn, contractType: "INDEFINITE",
      position: "Công nhân", startDate: PLACEHOLDER_START,
      baseSalary: n.base, allowance: n.allow, status: "ACTIVE",
    }});
    console.log(`  -> đã tạo User+Employee+Contract (${emp.code})`);
  }
  console.log(APPLY ? "\nXong." : "\nDRY-RUN. Chạy --apply để tạo.");
}
main().finally(()=>process.exit(0));
