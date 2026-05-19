import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({ reason: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "HR_ADMIN" && role !== "BOM")
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { id } = await params;
  const body = Schema.parse(await request.json());
  const b = await prisma.roomBooking.findUnique({ where: { id } });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (b.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  const userId = (session.user as any).id;
  const data = await prisma.roomBooking.update({
    where: { id },
    data: { status: "REJECTED", approvedById: userId, approvedAt: new Date(), rejectReason: body.reason },
  });
  return NextResponse.json({ data });
}
