import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { createEmployeeFromCandidate, notifyEmployeeCreated } from "@/lib/employee-from-candidate";

const UpdateSchema = z.object({
  status: z.enum(["NEW","SCREENING","INTERVIEW","INTERVIEWED","OFFERED","ACCEPTED","REJECTED","WITHDRAWN"]).optional(),
  interviewDate: z.string().optional().nullable(),
  interviewNote: z.string().optional().nullable(),
  interviewScore: z.number().min(0).max(10).optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.interviewDate) updateData.interviewDate = new Date(parsed.data.interviewDate);

  // ── ACCEPTED transition: workflow chuẩn đi qua Tab 2 Thư mời (mark-result).
  // API này GIỮ LẠI logic auto-create Employee để backward-compat,
  // nhưng UI không expose nút "→ ACCEPTED" nữa.
  const isAcceptedTransition =
    parsed.data.status === "ACCEPTED" && candidate.status !== "ACCEPTED";

  if (!isAcceptedTransition) {
    const updated = await prisma.candidate.update({ where: { id }, data: updateData });
    return NextResponse.json({ data: updated });
  }

  try {
    const { updated, created } = await prisma.$transaction(async (tx) => {
      const u = await tx.candidate.update({ where: { id }, data: updateData });
      const c = await createEmployeeFromCandidate(id, tx);
      return { updated: u, created: c };
    });

    // Notify HR_ADMIN/BOM (outside transaction)
    await notifyEmployeeCreated(prisma, created.id, candidate.fullName, created.code).catch(() => {});

    return NextResponse.json({
      data: {
        ...updated,
        createdEmployee: created,
      },
    });
  } catch (err: any) {
    console.error("Auto-create employee failed:", err);
    const fallback = await prisma.candidate.update({ where: { id }, data: updateData });
    return NextResponse.json({
      data: fallback,
      warning: `Cập nhật trạng thái thành công nhưng tạo tài khoản NV thất bại: ${err.message}. Vui lòng tạo thủ công.`,
    });
  }
}
