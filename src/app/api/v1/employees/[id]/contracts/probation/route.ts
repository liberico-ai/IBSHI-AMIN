import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

// POST — Phát hành HĐ THỬ VIỆC (chờ TP HCNS duyệt). Không đóng BHXH, không phụ cấp.
const Schema = z.object({
  contractNumber: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  baseSalary: z.number().int().min(0).max(2_000_000_000),
  position: z.string().optional().nullable(),
  documentHtml: z.string().optional().nullable(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canUser(session.user as any, "m1.luonghd:edit")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { id: employeeId } = await params;
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const b = parsed.data;

  // Không cho tạo trùng nếu đã có HĐ thử việc đang chờ duyệt / đã duyệt
  const existing = await prisma.contract.findFirst({
    where: { employeeId, contractType: "PROBATION", status: { in: ["PENDING_APPROVAL", "ACTIVE"] } },
  });
  if (existing) {
    return NextResponse.json({ error: { code: "DUPLICATE", message: "Nhân viên đã có HĐ thử việc (chờ duyệt hoặc đã duyệt)" } }, { status: 409 });
  }

  try {
    const created = await prisma.contract.create({
      data: {
        employeeId,
        contractNumber: b.contractNumber.trim(),
        contractType: "PROBATION",
        position: b.position || null,
        startDate: new Date(b.startDate),
        endDate: new Date(b.endDate),
        baseSalary: b.baseSalary,
        insuranceSalary: null, // thử việc không đóng BHXH
        allowance: null,
        documentHtml: b.documentHtml || null,
        status: "PENDING_APPROVAL",
      },
    });

    // Thông báo cho TP HCNS / BOM
    const approvers = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true }, select: { id: true } });
    await prisma.notification.createMany({
      data: approvers.map((u) => ({
        userId: u.id,
        title: "HĐ thử việc chờ duyệt",
        message: `Có HĐ thử việc ${created.contractNumber} cần duyệt.`,
        type: "APPROVAL_REQUIRED",
        referenceType: "contract",
        referenceId: created.id,
      })),
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err: any) {
    console.error("[probation.POST]", err?.message || err);
    return NextResponse.json({ error: { code: "CREATE_FAILED", message: "Không tạo được HĐ thử việc." } }, { status: 400 });
  }
}
