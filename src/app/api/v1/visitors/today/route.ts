import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/visitors/today — returns today's visitor requests
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const data = await prisma.visitorRequest.findMany({
    where: { visitDate: { gte: startOfDay, lte: endOfDay } },
    include: { host: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } } },
    orderBy: { visitDate: "asc" },
  });

  return NextResponse.json({ data, meta: { date: now.toISOString().slice(0, 10), total: data.length } });
}
