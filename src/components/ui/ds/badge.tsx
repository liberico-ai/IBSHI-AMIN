"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "info" | "default";

const variantClass: Record<Variant, string> = {
  success: "bg-[#ecfdf5] text-[var(--success)] border-[#a7f3d0]",
  warning: "bg-[#fffbeb] text-[var(--warning)] border-[#fde68a]",
  danger: "bg-[#fef2f2] text-[var(--danger)] border-[#fecaca]",
  info: "bg-[#eff6ff] text-[var(--info)] border-[#bfdbfe]",
  default: "bg-[var(--ibs-bg-card-hover)] text-[var(--ibs-text-muted)] border-[var(--ibs-border)]",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-[var(--text-xs)] font-semibold whitespace-nowrap",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
