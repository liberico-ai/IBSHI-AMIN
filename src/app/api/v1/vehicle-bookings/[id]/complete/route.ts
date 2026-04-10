import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CompleteSchema = z.object({
  actualKm: z.number().int().min(0).optional(),
  returnTime: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = CompleteSchema.safeParse(body);

  const updateData: any = { status: "COMPLETED" };
  if (parsed.success) {
    if (parsed.data.actualKm !== undefined) updateData.actualKm = parsed.data.actualKm;
    if (parsed.data.returnTime !== undefined) updateData.returnTime = parsed.data.returnTime;
  }

  const updated = await prisma.vehicleBooking.update({ where: { id }, data: updateData });
  return NextResponse.json({ data: updated });
}
