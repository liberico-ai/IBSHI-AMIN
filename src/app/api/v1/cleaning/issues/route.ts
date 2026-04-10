import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const IssueSchema = z.object({
  reportedBy: z.string().uuid(),
  zoneName: z.string().min(1),
  description: z.string().min(1),
});

// GET /api/v1/cleaning/issues?status=REPORTED
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: any = {};
  if (status) where.status = status;

  const issues = await prisma.cleaningIssue.findMany({
    where,
    include: {
      reporter: { select: { code: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: issues });
}

// POST /api/v1/cleaning/issues — any employee can report
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await request.json();
  const parsed = IssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const issue = await prisma.cleaningIssue.create({
    data: {
      reportedBy: parsed.data.reportedBy,
      zoneName: parsed.data.zoneName,
      description: parsed.data.description,
    },
    include: {
      reporter: { select: { code: true, fullName: true } },
    },
  });

  // Notify HR_ADMIN about the reported issue
  const hrAdmins = await prisma.user.findMany({
    where: { role: { in: ["HR_ADMIN", "MANAGER"] }, isActive: true },
    select: { id: true },
  });
  if (hrAdmins.length > 0) {
    await prisma.notification.createMany({
      data: hrAdmins.map((u) => ({
        userId: u.id,
        title: "Phản ánh vệ sinh mới",
        message: `${issue.reporter.fullName} báo phản ánh khu vực "${issue.zoneName}": ${issue.description}`,
        type: "SYSTEM" as const,
        referenceType: "cleaning_issue",
        referenceId: issue.id,
      })),
    });
  }

  return NextResponse.json({ data: issue }, { status: 201 });
}
