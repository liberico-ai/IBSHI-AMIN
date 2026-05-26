import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewPayroll } from "@/lib/access";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const employeeCode = (session.user as any).employeeCode;
  return NextResponse.json({
    id: (session.user as any).id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user as any).role,
    employeeCode,
    canViewPayroll: canViewPayroll(employeeCode),
  });
}
