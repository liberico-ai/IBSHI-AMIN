import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { generateReconcileForLog } from "@/lib/attendance-reconcile";
import { z } from "zod";

const EntrySchema = z.object({
  employeeId: z.string().min(1),
  employeeName: z.string().optional().nullable(),
  projectCode: z.string().min(1),
  hours: z.number().positive(),
  category: z.string().min(1),
});
const UpdateSchema = z.object({
  date: z.string().transform((s) => new Date(s)).optional(),
  submit: z.boolean().optional(),
  entries: z.array(EntrySchema).min(1),
});

// PUT — sửa phiếu khi còn NHÁP (chủ phiếu hoặc người có quyền sửa). Có thể kèm gửi duyệt.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const log = await prisma.teamWorkLog.findUnique({ where: { id }, select: { createdById: true, status: true } });
  if (!log) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (log.status !== "DRAFT") return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa được phiếu đang NHÁP" } }, { status: 400 });
  const isOwner = log.createdById === userId;
  if (!isOwner && !canUser(session.user as any, "m3.phieuto:edit"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc người có quyền sửa" } }, { status: 403 });

  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const { date, submit, entries } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.teamWorkLogEntry.deleteMany({ where: { logId: id } });
    return tx.teamWorkLog.update({
      where: { id },
      data: {
        ...(date ? { date } : {}),
        ...(submit ? { status: "PENDING" } : {}),
        entries: {
          create: entries.map((e) => ({
            employeeId: e.employeeId, employeeName: e.employeeName || "",
            projectCode: e.projectCode, hours: e.hours, category: e.category,
          })),
        },
      },
      include: { entries: true },
    });
  });

  if (submit) {
    await generateReconcileForLog({
      date: updated.date, departmentId: updated.departmentId, departmentName: updated.departmentName,
      entries: updated.entries.map((e) => ({ employeeId: e.employeeId, employeeName: e.employeeName, hours: e.hours })),
    });
  }
  return NextResponse.json({ data: updated });
}

// DELETE — xóa phiếu (chủ phiếu khi còn NHÁP, hoặc người có quyền Duyệt).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const log = await prisma.teamWorkLog.findUnique({ where: { id }, select: { createdById: true, status: true } });
  if (!log) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const isOwnerDraft = log.createdById === userId && log.status === "DRAFT";
  if (!isOwnerDraft && !canUser(session.user as any, "m3.phieuto:edit"))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu (nháp) hoặc người có quyền sửa được xóa" } }, { status: 403 });

  await prisma.teamWorkLog.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
