import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/employees/lookup?q=<tên|mã>
//   Tra cứu NHẸ danh sách NV đang làm việc (id, mã, họ tên, phòng ban) để chọn vào picker
//   (vd mời người tham gia họp). KHÔNG lộ dữ liệu nhạy cảm (lương/HĐ...). Ai đăng nhập cũng dùng được
//   — danh bạ tên/phòng là thông tin công khai nội bộ (như sơ đồ tổ chức M2).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") || "").trim();

  const data = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: { fullName: "asc" },
    take: 20,
  });

  return NextResponse.json({ data });
}
