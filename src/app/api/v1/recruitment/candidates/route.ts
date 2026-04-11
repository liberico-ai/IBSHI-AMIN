import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  recruitmentId: z.string().uuid(),
  fullName: z.string().min(2),
  phone: z.string().regex(/^0\d{9}$/, "Số điện thoại không hợp lệ"),
  email: z.string().email().optional().nullable(),
  referredBy: z.string().optional().nullable(),
  resumeUrl: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const recruitmentId = searchParams.get("recruitmentId") || "";
  const status = searchParams.get("status") || "";

  const where: any = {};
  if (recruitmentId) where.recruitmentId = recruitmentId;
  if (status) where.status = status;

  const data = await prisma.candidate.findMany({
    where,
    include: { recruitment: { include: { department: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const candidate = await prisma.candidate.create({
    data: { ...parsed.data, status: "NEW" },
    include: { recruitment: true },
  });

  return NextResponse.json({ data: candidate }, { status: 201 });
}
