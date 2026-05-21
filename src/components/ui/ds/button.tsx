"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variantClass: Record<Variant, string> = {
  primary: "bg-[var(--ibs-navy)] text-white hover:brightness-110",
  accent: "bg-[var(--ibs-red)] text-white hover:brightness-110",
  outline:
    "bg-white text-[var(--ibs-navy)] border border-[var(--ibs-border)] hover:bg-[var(--ibs-bg-card-hover)]",
  ghost:
    "bg-transparent text-[var(--ibs-text)] hover:bg-[var(--ibs-bg-card-hover)]",
  danger: "bg-[var(--danger)] text-white hover:brightness-110",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-[var(--text-sm)] gap-1.5",
  md: "h-10 px-4 text-[var(--text-sm)] gap-2",
  lg: "h-12 px-6 text-[var(--text-md)] gap-2",
  icon: "h-10 w-10 p-0",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, disabled, children, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius)] font-medium whitespace-nowrap transition-all outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ibs-red)]/40",
          "disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0",
          variantClass[variant],
          sizeClass[size],
          className
        )}
        {...props}
      >
        {loading && (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
