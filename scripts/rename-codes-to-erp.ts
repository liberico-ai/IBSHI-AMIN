import prisma from "../src/lib/prisma";
const APPLY = process.argv.includes("--apply");
async function main(){
  const emps = await prisma.employee.findMany({
    where: { user: { erpCode: { not: null } } },
    select: { id: true, code: true, userId: true, user: { select: { erpCode: true, employeeCode: true } } },
  });
  console.log(`${emps.length} NV có erpCode sẽ đổi code + employeeCode -> erpCode`);

  // kiểm tra an toàn: erpCode mục tiêu không đụng Employee.code đang tồn tại (của NV khác)
  const allCodes = new Set((await prisma.employee.findMany({ select: { code: true } })).map(e=>e.code));
  let conflict = 0;
  for (const e of emps) {
    const target = e.user!.erpCode!;
    if (allCodes.has(target) && target !== e.code) { conflict++; console.log(`  ! XUNG ĐỘT: erpCode ${target} trùng code NV khác`); }
  }
  console.log(`Xung đột: ${conflict}`);
  if (conflict > 0 && APPLY) { console.log("DỪNG do xung đột."); return; }

  let done = 0;
  if (APPLY) {
    for (const e of emps) {
      const target = e.user!.erpCode!;
      if (e.code === target && e.user!.employeeCode === target) continue;
      await prisma.$transaction([
        prisma.employee.update({ where: { id: e.id }, data: { code: target } }),
        prisma.user.update({ where: { id: e.userId }, data: { employeeCode: target } }),
      ]);
      done++;
    }
    console.log(`Đã đổi ${done} NV.`);
  } else {
    console.log("Ví dụ 5 thay đổi:");
    for (const e of emps.slice(0,5)) console.log(`  ${e.code} -> ${e.user!.erpCode}`);
    console.log("DRY-RUN. Chạy --apply để đổi.");
  }
}
main().finally(()=>process.exit(0));
