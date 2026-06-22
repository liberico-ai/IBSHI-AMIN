import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { moduleFromPath, apiModuleFromPath, inferAction } from "@/lib/activity-modules";

// POST — 2 chế độ:
//  (a) INTERNAL (middleware gọi, có header x-internal-log = NEXTAUTH_SECRET):
//      ghi log TÁC VỤ ghi qua API → action suy ra từ method+path, entityType="API".
//      Body: { userId, method, path, ip }.
//  (b) CLIENT (trình duyệt, có session): ghi log TRUY CẬP module (action="VIEW").
//      Body: { path }.
export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get("x-internal-log");
  const expected = process.env.NEXTAUTH_SECRET || "";

  // ── Chế độ INTERNAL: log tác vụ ghi qua API ──
  if (internalSecret && expected && internalSecret === expected) {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const userId = String(body?.userId || "").trim();
    const method = String(body?.method || "").trim();
    const path = String(body?.path || "").trim();
    if (!userId || !path) return NextResponse.json({ data: { skipped: true } });

    logAudit({
      userId,
      action: inferAction(method, path),
      entityType: "API",
      entityId: apiModuleFromPath(path),
      newValue: { method, path },
      ipAddress: body?.ip || undefined,
    });
    return NextResponse.json({ data: { logged: true } });
  }

  // ── Chế độ CLIENT: log truy cập module ──
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  let path = "";
  try {
    const body = await request.json();
    path = String(body?.path || "").trim();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400 });
  }
  if (!path || !path.startsWith("/")) return NextResponse.json({ data: { skipped: true } });

  const xff = request.headers.get("x-forwarded-for") || "";
  const ip = (xff.split(",")[0] || request.headers.get("x-real-ip") || "").trim() || undefined;

  logAudit({
    userId: (session.user as any).id,
    action: "VIEW",
    entityType: "Module",
    entityId: moduleFromPath(path),
    newValue: { path },
    ipAddress: ip,
  });

  return NextResponse.json({ data: { logged: true } });
}
