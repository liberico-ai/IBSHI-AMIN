import { PageTitle } from "@/components/layout/page-title";
import Link from "next/link";
import { Car, UtensilsCrossed, Sparkles, UserPlus, Calendar } from "lucide-react";

const SUB_MODULES = [
  {
    href: "/hanh-chinh/xe",
    icon: Car,
    title: "Quản lý xe",
    desc: "Đặt xe công tác, lịch sử sử dụng",
    color: "var(--ibs-accent)",
    bg: "rgba(0,180,216,0.1)",
  },
  {
    href: "/hanh-chinh/nha-an",
    icon: UtensilsCrossed,
    title: "Nhà ăn",
    desc: "Đăng ký suất ăn hàng ngày",
    color: "var(--ibs-success)",
    bg: "rgba(16,185,129,0.1)",
  },
  {
    href: "/hanh-chinh/ve-sinh",
    icon: Sparkles,
    title: "Vệ sinh",
    desc: "Lịch vệ sinh và kiểm tra khu vực",
    color: "var(--ibs-warning)",
    bg: "rgba(245,158,11,0.1)",
  },
  {
    href: "/hanh-chinh/khach",
    icon: UserPlus,
    title: "Đăng ký khách",
    desc: "Quản lý khách thăm quan, nhà thầu",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.1)",
  },
  {
    href: "/hanh-chinh/su-kien",
    icon: Calendar,
    title: "Sự kiện & Audit",
    desc: "Lịch sự kiện, audit nội bộ & bên ngoài",
    color: "var(--ibs-danger)",
    bg: "rgba(239,68,68,0.1)",
  },
];

export default function HanhChinhPage() {
  return (
    <div>
      <PageTitle
        title="M10 - Hành chính"
        description="Quản lý hành chính tổng hợp — xe, nhà ăn, vệ sinh, khách, sự kiện"
      />
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-3">
        {SUB_MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className="rounded-xl border p-5 transition-all duration-200 hover:translate-y-[-2px] block"
              style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
            >
              <div
                className="w-12 h-12 rounded-[12px] flex items-center justify-center mb-3"
                style={{ background: m.bg, color: m.color }}
              >
                <Icon size={22} />
              </div>
              <div className="text-[14px] font-semibold mb-1">{m.title}</div>
              <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
                {m.desc}
              </div>
              <div
                className="mt-3 text-[11px] font-semibold"
                style={{ color: m.color }}
              >
                Phase 3 — Q4/2026 →
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
