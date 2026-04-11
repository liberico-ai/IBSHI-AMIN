import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const LogSchema = z.object({
  zoneId: z.string().uuid(),
  date: z.string(),
  status: z.enum(["COMPLETED", "NEEDS_IMPROVEMENT", "MISSED"]).default("COMPLETED"),
  score: z.number().int().min(0).max(100).optional().nullable(),
  photoUrls: z.array(z.string()).optional().default([]),
  note: z.string().optional().nullable(),
  checkedBy: z.string().min(1),
});

// GET /api/v1/cleaning/logs?date=YYYY-MM-DD&zoneId=...
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const zoneId = searchParams.get("zoneId");

  const where: any = {};
  if (dateStr) {
    const d = new Date(dateStr);
    where.date = {
      gte: new Date(new Date(d).setHours(0, 0, 0, 0)),
      lte: new Date(new Date(d).setHours(23, 59, 59, 999)),
    };
  }
  if (zoneId) where.zoneId = zoneId;

  const logs = await prisma.cleaningLog.findMany({
    where,
    include: { zone: { select: { id: true, name: true, location: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ data: logs });
}

// POST /api/v1/cleaning/logs
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "cleaning", "manage")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const zone = await prisma.cleaningZone.findUnique({ where: { id: parsed.data.zoneId } });
  if (!zone) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const log = await prisma.cleaningLog.create({
    data: {
      zoneId: parsed.data.zoneId,
      date: new Date(parsed.data.date),
      status: parsed.data.status,
      score: parsed.data.score ?? null,
      photoUrls: parsed.data.photoUrls ?? [],
      note: parsed.data.note ?? null,
      checkedBy: parsed.data.checkedBy,
    },
    include: { zone: { select: { id: true, name: true, location: true } } },
  });

  return NextResponse.json({ data: log }, { status: 201 });
}
