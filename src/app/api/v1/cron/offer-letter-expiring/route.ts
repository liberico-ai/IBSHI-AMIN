import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Cron daily — đánh dấu các offer SENT đã quá 7 ngày → EXPIRED
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const now = new Date();
  const expiring = await prisma.offerLetter.findMany({
    where: { status: "SENT", expiresAt: { lt: now } },
    select: { id: true, candidateId: true, letterNumber: true, candidate: { select: { fullName: true } } },
  });

  if (expiring.length === 0) {
    return NextResponse.json({ data: { expired: 0 } });
  }

  await prisma.$transaction(async (tx) => {
    await tx.offerLetter.updateMany({
      where: { id: { in: expiring.map((o) => o.id) } },
      data: { status: "EXPIRED" },
    });
    // Đánh dấu candidate WITHDRAWN nếu họ chưa phản hồi
    await tx.candidate.updateMany({
      where: { id: { in: expiring.map((o) => o.candidateId) }, status: "OFFERED" },
      data: { status: "WITHDRAWN" },
    });
  });

  return NextResponse.json({ data: { expired: expiring.length } });
}
