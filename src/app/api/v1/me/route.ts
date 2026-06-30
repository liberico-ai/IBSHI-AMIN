import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewPayroll } from "@/lib/access";
import { VEHICLE_DRIVERS } from "@/lib/constants";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const employeeCode = (session.user as any).employeeCode;
  const emp = await prisma.employee.findFirst({ where: { userId }, select: { id: true, fullName: true, jobRole: true, departmentId: true } });
  // Lái xe: họ tên NV trùng danh sách lái xe (để hiện tab "Chuyến của tôi" + xác nhận chuyến).
  const isDriver = !!emp?.fullName && VEHICLE_DRIVERS.includes(emp.fullName);
  return NextResponse.json({
    id: userId,
    employeeId: emp?.id ?? null,
    fullName: emp?.fullName ?? null,
    jobRole: emp?.jobRole ?? null,
    departmentId: emp?.departmentId ?? null,
    name: session.user.name,
    email: session.user.email,
    role: (session.user as any).role,
    employeeCode,
    isDriver,
    canViewPayroll: canViewPayroll(employeeCode, (session.user as any).role),
  });
}
