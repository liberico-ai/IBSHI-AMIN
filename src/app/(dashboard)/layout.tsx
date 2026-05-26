import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { canViewPayroll } from "@/lib/access";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell
      userName={session.user.name || "Admin"}
      userRole={(session.user as any).role || "EMPLOYEE"}
      canViewPayroll={canViewPayroll((session.user as any).employeeCode)}
    >
      {children}
    </DashboardShell>
  );
}
