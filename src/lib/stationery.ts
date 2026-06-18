// Helpers cho module M10.3 Văn phòng phẩm.

import prisma from "@/lib/prisma";
import { canManageVpp } from "@/lib/access";

// Normalize tên item để fuzzy match (tránh duplicate "Giấy A4" vs "giấy a4").
export function normalizeItemName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Toàn quyền VPP (duyệt/từ chối + xem tất cả phiếu): 3 người được chỉ định HOẶC BGĐ (BOM).
export async function isStationeryApprover(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, employeeCode: true } });
  if (!user) return false;
  return canManageVpp(user.role, user.employeeCode);
}
