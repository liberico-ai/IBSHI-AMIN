import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  category: z.enum(["GATE_SECURITY", "DISCIPLINE", "EQUIPMENT", "SEAL", "UNIFORM", "GENERAL"]).default("GENERAL"),
  content: z.string().default(""),
  effectiveDate: z.string(),
  fileUrl: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";
  const active = searchParams.get("active");

  const where: any = {};
  if (category) where.category = category;
  if (active !== null) where.isActive = active === "true";

  const data = await prisma.regulation.findMany({
    where,
    orderBy: { effectiveDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  // Check unique code
  const existing = await prisma.regulation.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return NextResponse.json({ error: { code: "DUPLICATE_CODE", message: "Mã quy định đã tồn tại" } }, { status: 409 });
  }

  const regulation = await prisma.regulation.create({
    data: {
      ...parsed.data,
      effectiveDate: new Date(parsed.data.effectiveDate),
      isActive: true,
    },
  });

  return NextResponse.json({ data: regulation }, { status: 201 });
}
