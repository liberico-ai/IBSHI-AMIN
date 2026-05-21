"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Padding = "compact" | "default" | "spacious";

const paddingClass: Record<Padding, string> = {
  compact: "p-4",
  default: "p-6",
  spacious: "p-8",
};

export interface CardProps {
  padding?: Padding;
  hoverable?: boolean;
  accentColor?: string;
  as?: "div" | "a";
  href?: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler;
}

export function Card({
  padding = "default",
  hoverable,
  accentColor,
  as = "div",
  href,
  className,
  children,
  ...props
}: CardProps & Record<string, unknown>) {
  const Comp: any = as;
  return (
    <Comp
      href={as === "a" ? href : undefined}
      className={cn(
        "relative rounded-[var(--radius-lg)] bg-[var(--ibs-bg-card)] border border-[var(--ibs-border)] overflow-hidden",
        hoverable &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(10,37,64,0.08)] hover:border-[var(--ibs-navy)] cursor-pointer",
        paddingClass[padding],
        className
      )}
      {...props}
    >
      {accentColor && (
        <span
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: accentColor }}
        />
      )}
      {children}
    </Comp>
  );
}
