import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const CreateDeptSchema = z.object({
  code: z.string().trim().min(1, "Mã phòng ban bắt buộc"),
  name: z.string().trim().min(1, "Tên phòng ban bắt buộc"),
  nameEn: z.string().trim().optional().nullable(),
  directorateId: z.string().optional().nullable(),
  headcount: z.number().int().min(0).optional(),
});

// POST — thêm phòng ban mới (quyền m2.sodo:create).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m2.sodo:create"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền thêm phòng ban" } }, { status: 403 });

  const parsed = CreateDeptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 422 });
  const { code, name, nameEn, directorateId, headcount } = parsed.data;

  const dup = await prisma.department.findUnique({ where: { code } });
  if (dup) return NextResponse.json({ error: { code: "DUPLICATE", message: `Mã phòng ban "${code}" đã tồn tại` } }, { status: 409 });

  const last = await prisma.department.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const data = await prisma.department.create({
    data: { code, name, nameEn: nameEn || null, directorateId: directorateId || null, headcount: headcount ?? 0, sortOrder: (last?.sortOrder ?? 0) + 1, isActive: true },
  });
  return NextResponse.json({ data }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, headcount: true },
  });

  const teams = await prisma.productionTeam.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, departmentId: true },
  });

  return NextResponse.json({ data: departments, teams });
}
