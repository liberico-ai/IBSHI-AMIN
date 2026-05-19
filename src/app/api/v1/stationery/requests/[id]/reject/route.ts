import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isApprover } from "../../route";

const Schema = z.object({ reason: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  if (!(await isApprover(userId)))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { id } = await params;
  const body = Schema.parse(await request.json());
  const req = await prisma.stationeryRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (req.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  const data = await prisma.stationeryRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedById: userId, approvedAt: new Date(), rejectedReason: body.reason },
  });
  return NextResponse.json({ data });
}
