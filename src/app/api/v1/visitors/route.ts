import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const VisitorPurposeEnum = z.enum(["FACTORY_TOUR", "AUDIT", "SURVEY", "BUSINESS", "DELIVERY", "OTHER"]);

const CreateSchema = z.object({
  visitorName: z.string().min(2),
  visitorCompany: z.string().optional().nullable(),
  visitorPhone: z.string().min(9),
  hostEmployeeId: z.string().uuid(),
  visitDate: z.string(),
  purpose: VisitorPurposeEnum,
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const date = searchParams.get("date") || "";

  const where: any = {};
  if (status) where.status = status;
  if (date) {
    const d = new Date(date);
    where.visitDate = { gte: new Date(d.setHours(0,0,0,0)), lte: new Date(d.setHours(23,59,59,999)) };
  }

  const data = await prisma.visitorRequest.findMany({
    where,
    include: { host: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } } },
    orderBy: { visitDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const visitor = await prisma.visitorRequest.create({
    data: { ...parsed.data, visitDate: new Date(parsed.data.visitDate), status: "PENDING" },
    include: { host: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ data: visitor }, { status: 201 });
}
