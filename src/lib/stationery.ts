// Helpers cho module M10.3 Văn phòng phẩm.

import prisma from "@/lib/prisma";

// Normalize tên item để fuzzy match (tránh duplicate "Giấy A4" vs "giấy a4").
export function normalizeItemName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Check user có phải TP HCNS (quyền duyệt phiếu xuất VPP):
//   BOM (BGĐ) → duyệt mọi thứ.
//   HR_ADMIN + Position level MANAGER + Department chứa "HCNS" → TP HCNS.
export async function isStationeryApprover(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return false;
  // HCNS (HR_ADMIN) và BGĐ (BOM) được quản lý/cấp phát VPP.
  return user.role === "HR_ADMIN" || user.role === "BOM";
}
