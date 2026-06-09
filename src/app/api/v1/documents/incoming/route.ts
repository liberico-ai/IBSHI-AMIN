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
      { fromEntity: { contains: q, mode: "insensitive" } },
      { routedTo: { contains: q, mode: "insensitive" } },
    ];
  }
  if (from || to) {
    where.docDate = {};
    if (from) where.docDate.gte = new Date(from);
    if (to) where.docDate.lte = new Date(to + "T23:59:59");
  }

  // Phân quyền XEM: HCNS (HR_ADMIN/BOM) thấy tất cả. Người khác thấy:
  //   - Công văn loại CÔNG TY (thông báo chung — toàn công ty đều thấy), VÀ
  //   - Công văn ĐÍCH DANH (Cá nhân) gửi cho phòng ban của mình hoặc chính mình.
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const isHCNS = role === "HR_ADMIN" || role === "BOM";
  if (!isHCNS) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true, departmentId: true } });
    const visible: any[] = [{ recipientType: "CONG_TY" }];
    if (emp?.id) visible.push({ routedEmployeeId: emp.id });
    if (emp?.departmentId) visible.push({ routedDepartmentId: emp.departmentId });
    where.AND = [{ OR: visible }];
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
  // Chỉ Phòng HCNS (HR_ADMIN / BOM) được thêm công văn đến.
  const role = (session.user as any).role;
  if (!["HR_ADMIN", "BOM"].includes(role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ Phòng HCNS được thêm công văn đến" } }, { status: 403 });
  }

  const body = await req.json();
  const { docDate, docNumber, subject, fromEntity, routedTo, routedEmployeeId, routedDepartmentId, recipientType, scanFileUrl } = body || {};
  if (!scanFileUrl) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng upload file scan công văn" } }, { status: 400 });
  }
  if (!subject || !subject.trim()) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng nhập tiêu đề" } }, { status: 400 });
  }
  const isCaNhan = recipientType === "CA_NHAN";
  if (isCaNhan && !routedEmployeeId && !routedDepartmentId) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng chọn nơi nhận (cá nhân / phòng ban)" } }, { status: 400 });
  }

  const created = await prisma.incomingDocument.create({
    data: {
      docDate: docDate ? new Date(docDate) : null,
      docNumber: docNumber?.trim() || null,
      subject: subject.trim(),
      recipientType: isCaNhan ? "CA_NHAN" : "CONG_TY",
      fromEntity: isCaNhan ? null : (fromEntity?.trim() || null),
      routedTo: isCaNhan ? (routedTo?.trim() || null) : null,
      routedEmployeeId: isCaNhan ? (routedEmployeeId || null) : null,
      routedDepartmentId: isCaNhan ? (routedDepartmentId || null) : null,
      scanFileUrl,
      status: "RECEIVED",
    },
  });
  return NextResponse.json({ data: created });
}
