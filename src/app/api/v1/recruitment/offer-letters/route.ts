import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const CreateSchema = z.object({
  candidateId: z.string().uuid(),
  position: z.string().min(2),
  jobRole: z.string().optional().nullable(),
  departmentName: z.string().optional().nullable(),
  workLocation: z.string().optional(),
  officialSalary: z.number().int().min(0),
  probationarySalary: z.number().int().min(0),
  salaryBreakdown: z.object({
    baseSalary: z.number().int().min(0).default(0),
    farAllowance: z.number().int().min(0).default(0),
    kpiAllowance: z.number().int().min(0).default(0),
    positionAllowance: z.number().int().min(0).default(0),
  }).optional().nullable(),
  probationDays: z.number().int().min(1).max(180).default(60),
  startDate: z.string().datetime(),
  benefits: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  saveAsDraft: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.offer:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const data = await prisma.offerLetter.findMany({
    where: status ? { status } : {},
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.offer:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: parsed.data.candidateId },
    include: { recruitment: { include: { department: true } } },
  });
  if (!candidate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy ứng viên" } }, { status: 404 });

  const startDate = new Date(parsed.data.startDate);
  const probationEnd = new Date(startDate);
  probationEnd.setDate(probationEnd.getDate() + parsed.data.probationDays);

  // Số thư tự động: số tăng dần trong năm hiện tại
  const year = new Date().getFullYear();
  const lastInYear = await prisma.offerLetter.findFirst({
    where: { letterNumber: { contains: `/${year}/TM-IBSHI` } },
    orderBy: { createdAt: "desc" },
    select: { letterNumber: true },
  });
  let nextNum = 1;
  if (lastInYear?.letterNumber) {
    const m = lastInYear.letterNumber.match(/^(\d+)\//);
    if (m) nextNum = parseInt(m[1]) + 1;
  }
  const letterNumber = `${nextNum}/${year}/TM-IBSHI`;

  const hr = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true, fullName: true },
  });
  if (!hr) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ HR" } }, { status: 404 });

  const created = await prisma.offerLetter.create({
    data: {
      candidateId: parsed.data.candidateId,
      letterNumber,
      position: parsed.data.position,
      jobRole: parsed.data.jobRole ?? "Nhân viên",
      departmentName: parsed.data.departmentName ?? candidate.recruitment.department.name,
      workLocation: parsed.data.workLocation || "Km 6 Quốc lộ 5, Phường Hồng Bàng, Thành phố Hải Phòng, Việt Nam",
      officialSalary: parsed.data.officialSalary,
      probationarySalary: parsed.data.probationarySalary,
      salaryBreakdown: parsed.data.salaryBreakdown ?? undefined,
      probationDays: parsed.data.probationDays,
      startDate,
      probationEndDate: probationEnd,
      benefits: parsed.data.benefits ?? null,
      body: parsed.data.body ?? null,
      status: parsed.data.saveAsDraft ? "DRAFT" : "PENDING_HR_MGR",
      submittedAt: parsed.data.saveAsDraft ? null : new Date(),
      createdBy: hr.id,
    },
    include: {
      candidate: { select: { fullName: true, email: true } },
    },
  });

  // Notify HR managers (MANAGER role có scope HCNS) khi submit
  if (!parsed.data.saveAsDraft) {
    const hrMgrs = await prisma.user.findMany({
      where: { role: { in: ["MANAGER", "HR_ADMIN"] }, isActive: true },
      select: { id: true },
    });
    // Loại bỏ chính người tạo (không tự thông báo cho mình)
    const ownerUserId = (session.user as any).id;
    const recipients = hrMgrs.filter((u) => u.id !== ownerUserId);
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((u) => ({
          userId: u.id,
          title: "Thư mời nhận việc chờ duyệt",
          message: `${hr.fullName} vừa tạo thư mời số ${letterNumber} cho ứng viên ${created.candidate.fullName}`,
          type: "APPROVAL_REQUIRED",
          referenceType: "offer_letter",
          referenceId: created.id,
        })),
      });
    }
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
