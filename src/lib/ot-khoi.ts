import prisma from "@/lib/prisma";

// ─── Định tuyến duyệt Tăng ca theo KHỐI (chốt 2026-07-06) ──────────────────────
// Mỗi phòng ban thuộc 1 Khối (Directorate). 1 khối có thể có NHIỀU giám đốc (Directorate.directorIds = Employee.id[]).
// Luồng A: Tổ trưởng/TP ĐỀ XUẤT → BẤT KỲ giám đốc nào của khối phụ trách DUYỆT THẲNG (PENDING → APPROVED).
// Mỗi giám đốc CHỈ thấy + duyệt đơn của phòng ban thuộc (các) khối mình phụ trách.

/** (Các) khối mà user này làm giám đốc — rỗng nếu không phải GĐ khối nào. */
export async function getDirectedKhoiIds(userId: string): Promise<string[]> {
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
  if (!emp) return [];
  const dirs = await prisma.directorate.findMany({ where: { directorIds: { has: emp.id } }, select: { id: true } });
  return dirs.map((d) => d.id);
}

/** departmentId thuộc các khối này (để lọc đơn OT theo khối). */
export async function departmentIdsOfKhois(directorateIds: string[]): Promise<string[]> {
  if (!directorateIds.length) return [];
  const deps = await prisma.department.findMany({ where: { directorateId: { in: directorateIds } }, select: { id: true } });
  return deps.map((d) => d.id);
}

/** Các giám đốc của khối phụ trách 1 phòng ban (để thông báo). null nếu phòng không thuộc khối nào. */
export async function directorsOfDepartment(
  departmentId: string | null | undefined
): Promise<{ directorUserIds: string[]; khoiName: string } | null> {
  if (!departmentId) return null;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { directorate: { select: { directorIds: true, name: true } } },
  });
  const empIds = dept?.directorate?.directorIds ?? [];
  if (!empIds.length) return null;
  const emps = await prisma.employee.findMany({ where: { id: { in: empIds } }, select: { userId: true } });
  const directorUserIds = emps.map((e) => e.userId).filter((u): u is string => !!u);
  if (!directorUserIds.length) return null;
  return { directorUserIds, khoiName: dept!.directorate!.name };
}

/** User này có phải giám đốc khối phụ trách phòng ban của đơn không? (để cho phép duyệt/từ chối) */
export async function isDirectorOfDepartment(userId: string, departmentId: string | null | undefined): Promise<boolean> {
  if (!departmentId) return false;
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
  if (!emp) return false;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { directorate: { select: { directorIds: true } } },
  });
  return (dept?.directorate?.directorIds ?? []).includes(emp.id);
}
