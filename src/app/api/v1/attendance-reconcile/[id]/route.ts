import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const Schema = z.object({ actualHours: z.number().min(0) });

// PUT — HCNS nhập "thời gian thực" cho mục đối soát (quyền m3.doisoat:edit). Chỉ khi còn OPEN.
// Nhập/đổi thời gian thực → reset lại 2 cờ duyệt (vì số đã đổi, cần duyệt lại).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.doisoat:edit")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền nhập thời gian thực" } }, { status: 403 });
  const { id } = await params;

  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });

  const row = await prisma.attendanceReconcile.findUnique({ where: { id }, select: { status: true } });
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (row.status === "RESOLVED") return NextResponse.json({ error: { code: "INVALID_STATE", message: "Mục đã đối soát xong, không sửa được" } }, { status: 400 });

  const data = await prisma.attendanceReconcile.update({
    where: { id },
    data: { actualHours: parsed.data.actualHours, hcnsApproved: false, xuongApproved: false, hcnsApprovedById: null, xuongApprovedById: null },
  });
  return NextResponse.json({ data });
}
