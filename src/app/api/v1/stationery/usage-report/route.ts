import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageVpp } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&departmentId=... — TỔNG HỢP VPP đã CẤP (sử dụng) theo mặt hàng.
// Gộp số đã cấp (issuedQuantity) của các phiếu ĐÃ HOÀN THÀNH trong khoảng kỳ.
// Người trong whitelist VPP xem mọi phòng; người khác chỉ xem phòng mình.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const employeeCode = (session.user as any).employeeCode;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Thiếu from/to (YYYY-MM-DD)" } }, { status: 400 });
  }
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T23:59:59.999+07:00`);

  // Phòng ban: whitelist chọn tuỳ ý (hoặc tất cả); người khác bị khoá về phòng mình.
  let departmentId = searchParams.get("departmentId") || null;
  let departmentName = "Tất cả phòng ban";
  if (!canUser(session.user as any, "m10.vpp:edit")) {
    const meEmp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    departmentId = meEmp?.departmentId ?? "__none__";
  }
  if (departmentId && departmentId !== "__none__") {
    const dep = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
    departmentName = dep?.name || departmentName;
  }

  const items = await prisma.stationeryRequestItem.findMany({
    where: {
      issuedQuantity: { gt: 0 },
      request: {
        status: "COMPLETED",
        completedAt: { gte: start, lte: end },
        ...(departmentId && departmentId !== "__none__" ? { requester: { departmentId } } : {}),
      },
    },
    select: { issuedQuantity: true, item: { select: { id: true, name: true, unit: true } } },
  });

  const map = new Map<string, { name: string; unit: string; total: number }>();
  for (const it of items) {
    const cur = map.get(it.item.id) || { name: it.item.name, unit: it.item.unit, total: 0 };
    cur.total += it.issuedQuantity || 0;
    map.set(it.item.id, cur);
  }
  const data = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return NextResponse.json({ data, departmentName, from, to });
}
