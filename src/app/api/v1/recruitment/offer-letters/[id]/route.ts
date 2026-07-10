import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const UpdateSchema = z.object({
  position: z.string().min(2).optional(),
  departmentName: z.string().optional().nullable(),
  workLocation: z.string().optional(),
  officialSalary: z.number().int().min(0).optional(),
  probationarySalary: z.number().int().min(0).optional(),
  probationDays: z.number().int().min(1).max(180).optional(),
  startDate: z.string().datetime().optional(),
  benefits: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  submit: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const data = await prisma.offerLetter.findUnique({
    where: { id: params.id },
    include: {
      candidate: {
        select: {
          id: true, fullName: true, phone: true, email: true, status: true,
          recruitment: {
            select: {
              positionName: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const existing = await prisma.offerLetter.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (!["DRAFT", "REJECTED"].includes(existing.status)) {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa khi DRAFT hoặc REJECTED" } }, { status: 409 });
  }

  const data: any = { ...parsed.data };
  delete data.submit;

  if (data.startDate) {
    data.startDate = new Date(data.startDate);
    const days = data.probationDays ?? existing.probationDays;
    const pe = new Date(data.startDate);
    pe.setDate(pe.getDate() + days);
    data.probationEndDate = pe;
  } else if (data.probationDays) {
    const pe = new Date(existing.startDate);
    pe.setDate(pe.getDate() + data.probationDays);
    data.probationEndDate = pe;
  }

  if (parsed.data.submit) {
    data.status = "PENDING_HR_MGR";
    data.submittedAt = new Date();
  }

  const updated = await prisma.offerLetter.update({
    where: { id: params.id },
    data,
    include: { candidate: { select: { fullName: true } } },
  });

  if (parsed.data.submit) {
    const hrMgrs = await prisma.user.findMany({
      where: { role: { in: ["MANAGER", "HR_ADMIN"] }, isActive: true },
      select: { id: true },
    });
    const ownerUserId = (session.user as any).id;
    const recipients = hrMgrs.filter((u) => u.id !== ownerUserId);
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((u) => ({
          userId: u.id,
          title: "Thư mời nhận việc chờ duyệt (re-submit)",
          message: `Thư mời số ${updated.letterNumber} cho ${updated.candidate.fullName} đã được gửi lại để duyệt`,
          type: "APPROVAL_REQUIRED",
          referenceType: "offer_letter",
          referenceId: updated.id,
        })),
      });
    }
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const existing = await prisma.offerLetter.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!["DRAFT", "REJECTED"].includes(existing.status)) {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xoá khi DRAFT hoặc REJECTED" } }, { status: 409 });
  }

  await prisma.offerLetter.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
