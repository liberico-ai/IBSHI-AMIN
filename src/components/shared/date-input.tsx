"use client";
import React from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function DateInput({ onClick, ...props }: Props) {
  return (
    <input
      type="date"
      {...props}
      onClick={(e) => {
        (e.currentTarget as HTMLInputElement).showPicker?.();
        onClick?.(e);
      }}
    />
  );
}

export function TimeInput({ onClick, ...props }: Props) {
  return (
    <input
      type="time"
      {...props}
      onClick={(e) => {
        (e.currentTarget as HTMLInputElement).showPicker?.();
        onClick?.(e);
      }}
    />
  );
}
