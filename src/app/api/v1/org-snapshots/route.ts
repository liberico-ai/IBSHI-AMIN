import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { captureOrgSnapshot, currentPeriod } from "@/lib/org-snapshot";

// GET /api/v1/org-snapshots            → danh sách các tháng đã chốt
// GET /api/v1/org-snapshots?period=... → chi tiết sĩ số phòng/tổ của tháng đó
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const period = req.nextUrl.searchParams.get("period");
  if (period) {
    const rows = await prisma.orgSnapshot.findMany({ where: { period }, orderBy: { refName: "asc" } });
    return NextResponse.json({ data: rows });
  }
  const all = await prisma.orgSnapshot.findMany({ distinct: ["period"], select: { period: true }, orderBy: { period: "desc" } });
  return NextResponse.json({ data: all.map((x) => x.period) });
}

// POST /api/v1/org-snapshots { period? } → chốt snapshot (mặc định tháng hiện tại). Chỉ HCNS.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!["HR_ADMIN", "BOM"].includes(role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ HCNS được chốt snapshot" } }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const period = (body?.period as string) || currentPeriod();
  const res = await captureOrgSnapshot(period);
  return NextResponse.json({ data: res });
}
