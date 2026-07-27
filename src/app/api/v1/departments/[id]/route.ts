import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const UpdateDeptSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  nameEn: z.string().trim().optional().nullable(),
  directorateId: z.string().optional().nullable(),
  headcount: z.number().int().min(0).optional(),
});

// PATCH — sửa thông tin phòng ban (quyền m2.sodo:edit).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m2.sodo:edit"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền sửa phòng ban" } }, { status: 403 });

  const { id } = await params;
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const parsed = UpdateDeptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 422 });
  const d = parsed.data;

  // Đổi mã → chặn trùng với phòng khác.
  if (d.code && d.code !== dept.code) {
    const dup = await prisma.department.findUnique({ where: { code: d.code } });
    if (dup) return NextResponse.json({ error: { code: "DUPLICATE", message: `Mã phòng ban "${d.code}" đã tồn tại` } }, { status: 409 });
  }

  const upd: any = {};
  if (d.code !== undefined) upd.code = d.code;
  if (d.name !== undefined) upd.name = d.name;
  if (d.nameEn !== undefined) upd.nameEn = d.nameEn || null;
  if (d.directorateId !== undefined) upd.directorateId = d.directorateId || null;
  if (d.headcount !== undefined) upd.headcount = d.headcount;

  const data = await prisma.department.update({ where: { id }, data: upd });
  return NextResponse.json({ data });
}

// DELETE — xóa phòng ban (quyền m2.sodo:delete). CHẶN nếu còn NV đang làm → bắt chuyển NV trước.
// Không còn NV → ẩn khỏi sơ đồ (isActive=false), giữ dữ liệu lịch sử.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m2.sodo:delete"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền xóa phòng ban" } }, { status: 403 });

  const { id } = await params;
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const activeCount = await prisma.employee.count({ where: { departmentId: id, status: { in: ["ACTIVE", "PROBATION"] } } });
  if (activeCount > 0) {
    return NextResponse.json(
      { error: { code: "HAS_EMPLOYEES", message: `Phòng "${dept.name}" còn ${activeCount} nhân sự đang làm. Vui lòng chuyển hết nhân sự sang phòng khác trước khi xóa.` } },
      { status: 409 }
    );
  }

  await prisma.department.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ data: { ok: true } });
}
