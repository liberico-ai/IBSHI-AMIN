import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "kpi", "readDept")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") ? parseInt(searchParams.get("quarter")!) : undefined;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : new Date().getFullYear();

  const where: any = { year };
  if (quarter) where.quarter = quarter;

  const scores = await prisma.kPIScore.findMany({
    where,
    include: {
      department: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }, { overallScore: "desc" }],
  });

  return NextResponse.json({ data: scores });
}
