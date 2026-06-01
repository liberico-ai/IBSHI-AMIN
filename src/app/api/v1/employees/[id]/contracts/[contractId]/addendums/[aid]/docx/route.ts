import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { renderContractDocxFromHtml, safeFileName } from "@/lib/contract-doc";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string; aid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { aid } = await params;
  const a = await prisma.contractAddendum.findUnique({ where: { id: aid }, select: { addendumNumber: true, documentHtml: true } });
  if (!a || !a.documentHtml) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Chưa có nội dung phụ lục" } }, { status: 404 });
  const docx = await renderContractDocxFromHtml(a.documentHtml);
  const safe = safeFileName(a.addendumNumber);
  return new NextResponse(new Uint8Array(docx), {
    status: 200,
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="PhuLuc-${safe}.docx"` },
  });
}
