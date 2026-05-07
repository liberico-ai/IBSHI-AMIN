import { ModuleTabs, type ModuleTab } from "@/components/shared/module-tabs";

const TABS: ModuleTab[] = [
  { href: "/tuyen-dung", label: "Tổng quan & Pipeline" },
  { href: "/tuyen-dung/thu-moi", label: "Thư mời (Offer)" },
  { href: "/tuyen-dung/onboarding", label: "Onboarding 5 mục" },
  { href: "/tuyen-dung/danh-gia", label: "Đánh giá thử việc" },
];

export default function TuyenDungLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ModuleTabs tabs={TABS} />
      {children}
    </div>
  );
}
