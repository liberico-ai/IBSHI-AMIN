import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;

  const badge = await prisma.visitorBadge.findFirst({
    where: { registrationId: id },
    include: {
      registration: {
        select: {
          id: true,
          visitorName: true,
          visitorCompany: true,
          visitDate: true,
          purpose: true,
          mealCount: true,
          needsMeal: true,
          checkedInAt: true,
          host: { select: { fullName: true, department: { select: { name: true } } } },
        },
      },
    },
  });

  if (!badge) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Chưa cấp badge cho khách này" } }, { status: 404 });
  }

  // Fetch induction status if available
  let inductionStatus = null;
  if (badge.inductionId) {
    const induction = await prisma.hSEInduction.findUnique({
      where: { id: badge.inductionId },
      select: { status: true, passed: true, expiryDate: true, conductedBy: true },
    });
    inductionStatus = induction;
  }

  return NextResponse.json({
    data: {
      ...badge,
      inductionStatus,
    },
  });
}
