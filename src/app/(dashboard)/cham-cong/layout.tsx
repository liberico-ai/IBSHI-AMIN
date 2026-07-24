import { Suspense } from "react";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ModuleTabs, type ModuleTab } from "@/components/shared/module-tabs";
import { canSeeOTTab } from "@/lib/ot-access";
import { canUser } from "@/lib/permission-catalog";

export default async function ChamCongLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  let jobRole: string | null = null;
  if (userId) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { jobRole: true } });
    jobRole = emp?.jobRole ?? null;
  }
  // Hiện tab Tăng ca khi: có quyền ma trận m3.tangca:view (cấp qua checkbox) HOẶC theo luồng cũ
  // (chức vụ Tổ trưởng/Trưởng phòng, role Quản lý/HCNS/BGĐ) — cấp đích danh vẫn có tác dụng.
  const showOT = canUser(session?.user as any, "m3.tangca:view") || canSeeOTTab({ jobRole, role });

  const TABS: ModuleTab[] = [
    { href: "/cham-cong", label: "Tổng hợp hôm nay" },
    { href: "/cham-cong?tab=grid", label: "Bảng công tháng" },
    { href: "/cham-cong/nghi-phep", label: "Xin Nghỉ" },
    ...(showOT ? [{ href: "/cham-cong/tang-ca", label: "Tăng ca" }] : []),
    { href: "/cham-cong/phieu-to", label: "Phiếu kê khai tổ" },
    { href: "/cham-cong/doi-soat", label: "Đối soát chấm công" },
    { href: "/cham-cong/giai-trinh", label: "Đơn giải trình" },
    { href: "/cham-cong/tong-hop", label: "Tổng hợp công tháng" },
  ];

  return (
    <div>
      <Suspense fallback={<div className="mb-5 pb-3" />}>
        <ModuleTabs tabs={TABS} />
      </Suspense>
      {children}
    </div>
  );
}
