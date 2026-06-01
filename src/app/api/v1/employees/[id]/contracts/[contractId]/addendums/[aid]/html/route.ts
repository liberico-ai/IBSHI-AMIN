import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string; aid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { aid } = await params;
  const a = await prisma.contractAddendum.findUnique({ where: { id: aid }, select: { addendumNumber: true, documentHtml: true } });
  if (!a) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: { html: a.documentHtml || "<p>(Chưa có nội dung)</p>", addendumNumber: a.addendumNumber } });
}
