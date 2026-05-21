"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const baseField =
  "w-full rounded-[var(--radius)] border bg-white px-3 py-2 text-[var(--text-sm)] text-[var(--ibs-text)] outline-none transition-colors placeholder:text-[var(--ibs-text-dim)] focus:border-[var(--ibs-red)] focus:ring-2 focus:ring-[var(--ibs-red)]/20 disabled:opacity-50";

function FieldWrap({
  label,
  error,
  children,
}: {
  label?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[var(--text-sm)] font-medium text-[var(--ibs-text)]">
          {label}
        </span>
      )}
      {children}
      {error && <span className="text-[var(--text-xs)] text-[var(--danger)]">{error}</span>}
    </label>
  );
}

export interface InputFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function InputField({ label, error, className, ...props }: InputFieldProps) {
  return (
    <FieldWrap label={label} error={error}>
      <input
        className={cn(baseField, error && "border-[var(--danger)]", !error && "border-[var(--ibs-border)]", className)}
        {...props}
      />
    </FieldWrap>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}
export interface SelectFieldProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}
export function SelectField({
  label,
  error,
  options,
  placeholder,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <FieldWrap label={label} error={error}>
      <select
        className={cn(baseField, error ? "border-[var(--danger)]" : "border-[var(--ibs-border)]", className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

export interface TextareaFieldProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function TextareaField({ label, error, className, ...props }: TextareaFieldProps) {
  return (
    <FieldWrap label={label} error={error}>
      <textarea
        className={cn(baseField, "resize-y", error ? "border-[var(--danger)]" : "border-[var(--ibs-border)]", className)}
        {...props}
      />
    </FieldWrap>
  );
}
