import prisma from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

// nguồn (không "Tổ") -> đích (có "Tổ")
const MERGE: Record<string, string> = {
  "Gá lắp 1": "Tổ Gá lắp 1",
  "Gá lắp 2": "Tổ Gá lắp 2",
  "Gá lắp 3": "Tổ Gá lắp 3",
  "Gá lắp 4": "Tổ Gá lắp 4",
  "Gá lắp 5": "Tổ Gá lắp 5",
  "GCCK": "Tổ Gia công cơ khí",
  "Hàn 1": "Tổ Hàn 1",
  "Hàn 2": "Tổ Hàn 2",
  "Pha cắt 2": "Tổ Pha cắt 2",
  "Pha cắt 3": "Tổ Pha cắt 3",
  "Sơn": "Tổ Sơn",
  "Tổng hợp": "Tổ Tổng hợp",
};

async function main() {
  const teams = await prisma.productionTeam.findMany({ include: { _count: { select: { employees: true } } } });
  const byName = new Map(teams.map((t) => [t.name, t]));

  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (chưa sửa gì) ===");
  let totalMoved = 0;
  const toDelete: string[] = [];

  for (const [src, dst] of Object.entries(MERGE)) {
    const s = byName.get(src), d = byName.get(dst);
    if (!s) { console.log(`! Bỏ qua: không thấy tổ nguồn "${src}"`); continue; }
    if (!d) { console.log(`! Bỏ qua: không thấy tổ đích "${dst}"`); continue; }
    const n = s._count.employees;
    totalMoved += n;
    const carryLeader = s.leaderId && !d.leaderId;
    console.log(`"${src}" (${n} NV)  ->  "${dst}"${carryLeader ? "  [chuyển cả tổ trưởng]" : ""}`);
    if (APPLY) {
      await prisma.employee.updateMany({ where: { teamId: s.id }, data: { teamId: d.id } });
      if (carryLeader) await prisma.productionTeam.update({ where: { id: d.id }, data: { leaderId: s.leaderId } });
      toDelete.push(s.id);
    }
  }

  if (APPLY) {
    await prisma.productionTeam.deleteMany({ where: { id: { in: toDelete } } });
    // cập nhật lại memberCount cho tất cả tổ còn lại
    const remain = await prisma.productionTeam.findMany({ include: { _count: { select: { employees: true } } } });
    for (const t of remain) {
      if (t.memberCount !== t._count.employees)
        await prisma.productionTeam.update({ where: { id: t.id }, data: { memberCount: t._count.employees } });
    }
    console.log(`\nĐã chuyển ${totalMoved} NV, xóa ${toDelete.length} tổ trùng. Còn lại ${remain.length} tổ.`);
  } else {
    console.log(`\n[DRY] Sẽ chuyển ${totalMoved} NV, xóa ${Object.keys(MERGE).length} tổ. Còn lại ${teams.length - Object.keys(MERGE).length} tổ.`);
    console.log("Chạy lại với --apply để thực thi.");
  }
}
main().finally(() => process.exit(0));
