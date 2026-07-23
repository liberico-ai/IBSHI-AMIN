import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ActivityTracker } from "@/components/activity-tracker";
import { canViewPayroll } from "@/lib/access";
import prisma from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Chức vụ (jobRole) của người đang đăng nhập — hiển thị dưới tên ở sidebar.
  const emp = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { jobRole: true },
  });
  const userTitle = emp?.jobRole?.trim() || null;

  return (
    <DashboardShell
      userName={session.user.name || "Admin"}
      userRole={(session.user as any).role || "EMPLOYEE"}
      userTitle={userTitle}
      canViewPayroll={canViewPayroll((session.user as any).employeeCode, (session.user as any).role)}
    >
      <ActivityTracker />
      {children}
    </DashboardShell>
  );
}
