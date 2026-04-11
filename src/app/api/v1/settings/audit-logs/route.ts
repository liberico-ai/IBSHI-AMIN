import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "settings", "update")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType") || "";
  const action = searchParams.get("action") || "";
  const limit = parseInt(searchParams.get("limit") || "100");

  const where: any = {};
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;

  const data = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, employeeCode: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data });
}
