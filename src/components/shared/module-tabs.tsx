"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ModuleTab {
  href: string;
  label: string;
  badge?: number;
  badgeType?: "warn" | "info";
}

interface ModuleTabsProps {
  tabs: ModuleTab[];
}

export function ModuleTabs({ tabs }: ModuleTabsProps) {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-wrap gap-2 mb-5 pb-3 border-b overflow-x-auto"
      style={{ borderColor: "var(--ibs-border)" }}
    >
      {tabs.map((tab) => {
        // Active when path matches exactly OR is a deeper sub-route
        const isActive = pathname === tab.href;

        const badgeColor =
          tab.badgeType === "warn"
            ? "#f59e0b"
            : tab.badgeType === "info"
            ? "var(--ibs-accent)"
            : "rgba(255,255,255,0.25)";

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
            style={{
              background: isActive ? "var(--ibs-accent)" : "var(--ibs-bg-card)",
              color: isActive ? "white" : "var(--ibs-text-muted)",
              border: `1px solid ${isActive ? "var(--ibs-accent)" : "var(--ibs-border)"}`,
            }}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center"
                style={{
                  background: isActive ? "rgba(255,255,255,0.25)" : badgeColor,
                  color: isActive ? "white" : "white",
                }}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
