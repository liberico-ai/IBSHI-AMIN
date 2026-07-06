import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, headcount: true },
  });

  const teams = await prisma.productionTeam.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, departmentId: true },
  });

  return NextResponse.json({ data: departments, teams });
}
