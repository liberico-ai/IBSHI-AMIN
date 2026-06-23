import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewPayroll } from "@/lib/access";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const employeeCode = (session.user as any).employeeCode;
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true, jobRole: true, departmentId: true } });
  return NextResponse.json({
    id: userId,
    employeeId: emp?.id ?? null,
    jobRole: emp?.jobRole ?? null,
    departmentId: emp?.departmentId ?? null,
    name: session.user.name,
    email: session.user.email,
    role: (session.user as any).role,
    employeeCode,
    canViewPayroll: canViewPayroll(employeeCode, (session.user as any).role),
  });
}
