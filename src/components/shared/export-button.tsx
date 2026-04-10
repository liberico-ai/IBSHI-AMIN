"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface ExportButtonProps {
  /** Async function that performs the export. Should throw on failure. */
  onExport: () => Promise<void>;
  label?: string;
  className?: string;
}

export function ExportButton({ onExport, label = "Xuất Excel", className = "" }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    if (exporting) return;
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={exporting}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-60 ${className}`}
      style={{ border: "1px solid var(--ibs-border)", color: "var(--ibs-text-muted)" }}
    >
      {exporting ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <Download size={13} />
      )}
      {exporting ? "Đang xuất..." : label}
    </button>
  );
}
