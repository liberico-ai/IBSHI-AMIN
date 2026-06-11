import { NextRequest, NextResponse } from "next/server";
import { captureOrgSnapshot, currentPeriod } from "@/lib/org-snapshot";

// POST /api/v1/cron/org-snapshot — chốt snapshot tháng hiện tại (chạy cuối tháng).
export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const res = await captureOrgSnapshot(currentPeriod());
  return NextResponse.json({ data: res });
}
