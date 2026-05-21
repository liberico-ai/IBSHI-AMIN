"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  color?: string;
  icon?: React.ReactNode;
  compact?: boolean;
  accent?: boolean;
  href?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  color = "var(--ibs-navy)",
  icon,
  compact,
  accent,
  href,
  className,
}: StatCardProps) {
  const Comp: any = href ? "a" : "div";
  return (
    <Comp
      href={href}
      className={cn(
        "relative flex items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--ibs-bg-card)] border border-[var(--ibs-border)] overflow-hidden",
        compact ? "p-4" : "p-6",
        href &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(10,37,64,0.08)] cursor-pointer",
        className
      )}
    >
      {accent && (
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      )}
      {icon && (
        <span
          className="flex items-center justify-center rounded-[var(--radius)] shrink-0"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            width: compact ? 40 : 48,
            height: compact ? 40 : 48,
          }}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div
          className="font-bold leading-none"
          style={{ color, fontSize: compact ? "var(--text-xl)" : "var(--text-2xl)" }}
        >
          {value}
        </div>
        <div className="mt-1 text-[var(--text-sm)] text-[var(--ibs-text-muted)] truncate">
          {label}
        </div>
      </div>
    </Comp>
  );
}
