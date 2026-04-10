import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId") || "";

  const where = departmentId ? { departmentId } : {};

  const positions = await prisma.position.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true, level: true, departmentId: true },
  });

  return NextResponse.json({ data: positions });
}
