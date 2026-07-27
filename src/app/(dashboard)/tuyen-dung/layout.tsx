import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { canUser } from "@/lib/permission-catalog";
import { ModuleTabs, type ModuleTab } from "@/components/shared/module-tabs";

export default async function TuyenDungLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const has = (perm: string) => canUser(session?.user as any, perm);

  // Mỗi tab gate bằng 1 quyền :view riêng. "Tổng quan & Pipeline" là trang mặc định → luôn mở.
  const TABS: (ModuleTab & { show?: boolean })[] = [
    { href: "/tuyen-dung", label: "Tổng quan & Pipeline" },
    { href: "/tuyen-dung/thu-moi", label: "Thư mời (Offer)", show: has("m4.offer:view") },
    { href: "/tuyen-dung/onboarding", label: "Onboard", show: has("m4.onboarding:view") },
    { href: "/tuyen-dung/danh-gia", label: "Đánh giá thử việc", show: has("m4.thuviec:view") },
  ];
  const visibleTabs = TABS.filter((t) => t.show !== false);

  return (
    <div>
      <Suspense fallback={<div className="mb-5 pb-3" />}>
        <ModuleTabs tabs={visibleTabs} />
      </Suspense>
      {children}
    </div>
  );
}
