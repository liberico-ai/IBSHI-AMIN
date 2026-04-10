"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, Search } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  onExport?: () => void;
  actions?: React.ReactNode;
  pageSize?: number;
  searchKeys?: string[];
  loading?: boolean;
  emptyText?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchPlaceholder = "Tìm kiếm...",
  onExport,
  actions,
  pageSize = 20,
  searchKeys,
  loading = false,
  emptyText,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search) return data;
    const lower = search.toLowerCase();
    const keys = searchKeys || columns.map((c) => c.key);
    return data.filter((row) =>
      keys.some((k) => {
        const val = String(row[k] ?? "").toLowerCase();
        return val.includes(lower);
      })
    );
  }, [data, search, searchKeys, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-[320px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--ibs-text-dim)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] outline-none"
            style={{
              background: "var(--ibs-bg)",
              border: "1px solid var(--ibs-border)",
              color: "var(--ibs-text)",
            }}
          />
        </div>
        <div className="ml-auto flex gap-2">
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors"
              style={{
                borderColor: "var(--ibs-border)",
                color: "var(--ibs-text-muted)",
                background: "transparent",
              }}
            >
              <Download size={13} /> Export Excel
            </button>
          )}
          {actions}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--ibs-border)" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    borderBottom: "1px solid var(--ibs-border)",
                    color: "var(--ibs-text-dim)",
                    cursor: col.sortable ? "pointer" : "default",
                    userSelect: "none",
                  }}
                  className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.8px] font-semibold"
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span style={{ color: "var(--ibs-text-dim)" }}>
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-10 text-sm" style={{ color: "var(--ibs-text-dim)" }}>
                  Đang tải...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-10 text-sm"
                  style={{ color: "var(--ibs-text-dim)" }}
                >
                  {emptyText || "Không có dữ liệu"}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr
                  key={i}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(46,117,182,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-[13px]">
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
            {sorted.length} kết quả · Trang {page}/{totalPages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded text-[12px] border disabled:opacity-40"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}
            >
              ‹ Trước
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page + i - 2;
              if (p < 1 || p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="px-3 py-1 rounded text-[12px] border"
                  style={{
                    borderColor: p === page ? "var(--ibs-accent)" : "var(--ibs-border)",
                    color: p === page ? "var(--ibs-accent)" : "var(--ibs-text-muted)",
                    background: p === page ? "rgba(0,180,216,0.1)" : "transparent",
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded text-[12px] border disabled:opacity-40"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}
            >
              Sau ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
