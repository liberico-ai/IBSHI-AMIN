import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/documents/incoming?q=&from=&to=
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const from = sp.get("from");
  const to = sp.get("to");

  const where: any = {};
  if (q) {
    where.OR = [
      { docNumber: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
    ];
  }
  if (from || to) {
    where.docDate = {};
    if (from) where.docDate.gte = new Date(from);
    if (to) where.docDate.lte = new Date(to + "T23:59:59");
  }

  const docs = await prisma.incomingDocument.findMany({
    where,
    orderBy: [{ docDate: "desc" }, { receivedAt: "desc" }],
    take: 500,
  });
  return NextResponse.json({ data: docs });
}

// POST /api/v1/documents/incoming { docDate, docNumber, subject, scanFileUrl }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!["HR_ADMIN", "BOM", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const { docDate, docNumber, subject, scanFileUrl } = body || {};
  if (!scanFileUrl) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng upload file scan công văn" } }, { status: 400 });
  }
  if (!subject || !subject.trim()) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng nhập tiêu đề" } }, { status: 400 });
  }

  const created = await prisma.incomingDocument.create({
    data: {
      docDate: docDate ? new Date(docDate) : null,
      docNumber: docNumber?.trim() || null,
      subject: subject.trim(),
      scanFileUrl,
      status: "RECEIVED",
    },
  });
  return NextResponse.json({ data: created });
}
