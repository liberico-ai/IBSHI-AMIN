"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface DashboardShellProps {
  userName: string;
  userRole: string;
  canViewPayroll?: boolean;
  children: React.ReactNode;
}

export function DashboardShell({ userName, userRole, canViewPayroll, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--ibs-bg)" }}>
      <Sidebar
        userName={userName}
        userRole={userRole}
        canViewPayroll={canViewPayroll}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
