import { ModuleTabs, type ModuleTab } from "@/components/shared/module-tabs";

const TABS: ModuleTab[] = [
  { href: "/cham-cong", label: "Tổng quan" },
  { href: "/cham-cong/nghi-phep", label: "Nghỉ phép" },
  { href: "/cham-cong/tang-ca", label: "Tăng ca" },
  { href: "/cham-cong/phieu-to", label: "Phiếu kê khai tổ" },
  { href: "/cham-cong/doi-soat", label: "Đối soát chấm công" },
  { href: "/cham-cong/giai-trinh", label: "Đơn giải trình" },
  { href: "/cham-cong/tong-hop", label: "Tổng hợp công tháng" },
];

export default function ChamCongLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ModuleTabs tabs={TABS} />
      {children}
    </div>
  );
}
