"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader, Button, Badge } from "@/components/ui";
import { apiError } from "@/lib/utils";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import { viewUrl } from "@/lib/use-presigned-url";
import { canManageVpp } from "@/lib/access";
import { Plus, Upload, Check, X, ChevronDown, ChevronRight, FileText, Package, Download } from "lucide-react";

type Supplier = { id: string; name: string };
type Item = { id: string; name: string; unit: string; note?: string | null; currentStock: number };
type StockIn = {
  id: string; importDate: string; notes?: string;
  supplier: { id: string; name: string };
  items: { quantity: number; item: { id: string; name: string; unit: string } }[];
};
type RequestItem = { quantity: number; issuedQuantity: number; confirmedQuantity: number; note?: string; item: { id: string; name: string; unit: string; currentStock: number } };
type Request = {
  id: string; status: string; reason: string; fileUrl: string;
  createdAt: string; approvedAt?: string; completedAt?: string; rejectedReason?: string;
  createdById: string;
  requester: { id: string; code: string; fullName: string; department: { name: string }; position: { name: string } };
  items: RequestItem[];
};
type Employee = { id: string; code: string; fullName: string; department: { name: string } };

const STATUS_BADGE: Record<string, { label: string; variant: "warning" | "info" | "success" | "danger" | "default" }> = {
  PENDING_APPROVAL: { label: "Chờ duyệt", variant: "warning" },
  APPROVED: { label: "Đã duyệt", variant: "info" },
  COMPLETED: { label: "Đã cấp", variant: "success" },
  REJECTED: { label: "Từ chối", variant: "danger" },
};

const fmt = (n: number) => Number.isInteger(n) ? n.toString() : n.toFixed(2);

// Dựng & tải Excel từ dữ liệu sẵn có (title + columns + rows).
async function downloadExcelData(
  title: string,
  columns: { header: string; key: string; width?: number }[],
  rows: Record<string, unknown>[],
  sheetName: string,
  filename: string,
) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
  ws.mergeCells(1, 1, 1, columns.length);
  const tc = ws.getCell(1, 1);
  tc.value = title;
  tc.font = { bold: true, size: 14 };
  ws.addRow([]);
  const hr = ws.addRow(columns.map((c) => c.header));
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; });
  for (const r of rows) ws.addRow(columns.map((c) => (r[c.key] ?? "") as any));
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const vnDateTime = (d: string) => new Date(d).toLocaleString("vi-VN");

export default function VppPage() {
  const [tab, setTab] = useState<"stock" | "stockIn" | "requests">("stock");
  const [me, setMe] = useState<{ id: string; role: string; employeeId: string | null; employeeCode: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      if (res?.id) setMe({ id: res.id, role: res.role, employeeId: res.employeeId ?? null, employeeCode: res.employeeCode ?? null });
    });
  }, []);

  const canSeeStockIn = canManageVpp(me?.role, me?.employeeCode);

  return (
    <div>
      <PageHeader title="M10.3 — Văn phòng phẩm" subtitle="Danh sách VPP, tạo yêu cầu VPP, phiếu yêu cầu xuất VPP" />

      <div className="flex gap-2 mb-4">
        {[
          { k: "stock", label: "Danh sách VPP", icon: Package },
          ...(canSeeStockIn ? [{ k: "stockIn", label: "Danh sách yêu cầu VPP", icon: FileText }] : []),
          { k: "requests", label: "Phiếu xuất VPP", icon: FileText },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k as any)}
              className={`filter-pill${active ? " active" : ""}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "stock" && <StockTab canManage={canSeeStockIn} />}
      {tab === "stockIn" && canSeeStockIn && <StockInTab />}
      {tab === "requests" && <RequestsTab me={me} />}
    </div>
  );
}

function StockTab({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/v1/stationery/items${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json()).then((res) => setItems(res.data || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex gap-3 mb-4 items-center">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên VPP..."
          className="px-3 py-2 rounded-lg border text-[13px] flex-1 max-w-md"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
        />
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{items.length} mặt hàng</span>
        <div className="ml-auto flex gap-2">
          {canManage && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold"
              style={{ border: "1px solid var(--ibs-accent)", color: "var(--ibs-accent)" }}>
              <Plus size={14} /> Thêm VPP
            </button>
          )}
          <button onClick={() => setShowRequest(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
            style={{ background: "var(--ibs-accent)" }}>
            <Plus size={14} /> Tạo yêu cầu VPP
          </button>
        </div>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <table className="w-full text-[13px]">
          <thead style={{ background: "rgba(0,180,216,0.05)" }}>
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Tên VPP</th>
              <th className="px-4 py-3 text-left font-semibold">Đơn vị tính</th>
              <th className="px-4 py-3 text-left font-semibold">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Chưa có VPP nào</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <td className="px-4 py-2.5 font-medium">{it.name}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{it.unit}</td>
                <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{it.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showRequest && <RequestVPPModal onClose={() => setShowRequest(false)} onSuccess={() => setShowRequest(false)} />}
      {showAdd && <AddVppModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

// Modal THÊM VPP vào danh mục (chỉ whitelist VPP).
function AddVppModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", unit: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) { setError("Cần nhập Tên VPP và Đơn vị tính"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/stationery/items", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(apiError(res.status, json?.error)); return; }
      onSuccess();
    } catch { setError("Lỗi kết nối"); }
    finally { setSaving(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "block text-[12px] font-semibold mb-1.5";
  const labelStyle = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--ibs-bg-card)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-bold">Thêm mặt hàng VPP</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={labelCls} style={labelStyle}>Tên VPP <span style={{ color: "var(--ibs-danger)" }}>*</span></label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Bút bi xanh Thiên Long" className={inputCls} style={inputStyle} autoFocus />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Đơn vị tính <span style={{ color: "var(--ibs-danger)" }}>*</span></label>
            <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="VD: Hộp, Cái, Cuộn, Ream" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Ghi chú</label>
            <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="VD: màu xanh (không bắt buộc)" className={inputCls} style={inputStyle} />
          </div>
          {error && <div className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Huỷ</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: saving ? 0.6 : 1 }}>{saving ? "Đang lưu..." : "Thêm"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal tạo yêu cầu VPP cho user phòng ban: trái = danh sách VPP (tích chọn), phải = đã chọn + nhập số lượng.
function RequestVPPModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, { name: string; unit: string; quantity: string }>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/v1/stationery/items${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json()).then((res) => setItems(res.data || []));
  }, [q]);

  const toggle = (it: Item) => setSelected((prev) => {
    const next = { ...prev };
    if (next[it.id]) delete next[it.id];
    else next[it.id] = { name: it.name, unit: it.unit, quantity: "1" };
    return next;
  });
  const setQty = (id: string, v: string) => setSelected((prev) => ({ ...prev, [id]: { ...prev[id], quantity: v.replace(/[^\d.]/g, "") } }));
  const selectedEntries = Object.entries(selected);

  async function save() {
    const payload = selectedEntries.filter(([, s]) => Number(s.quantity) > 0).map(([id, s]) => ({ itemId: id, quantity: Number(s.quantity) }));
    if (payload.length === 0) { setError("Vui lòng chọn ít nhất 1 VPP và nhập số lượng > 0"); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/v1/stationery/requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload, reason: reason || null }),
    });
    setSaving(false);
    if (res.ok) setDone(true);
    else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-3xl p-6 max-h-[92vh] overflow-hidden flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Tạo yêu cầu Văn phòng phẩm</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {done ? (
          <div className="py-10 text-center">
            <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--ibs-success)" }}>✅ Đã gửi yêu cầu VPP</div>
            <div className="text-[12px] mb-4" style={{ color: "var(--ibs-text-dim)" }}>Yêu cầu đang chờ HCNS duyệt.</div>
            <button onClick={onSuccess} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)" }}>Xong</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              {/* TRÁI: danh sách VPP để tích chọn */}
              <div className="flex flex-col min-h-0">
                <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Danh sách VPP</div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm VPP..."
                  className="px-3 py-2 rounded-lg border text-[13px] mb-2" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
                <div className="rounded-lg border overflow-y-auto" style={{ borderColor: "var(--ibs-border)", maxHeight: 340 }}>
                  {items.length === 0 ? <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Không có VPP</div> :
                    items.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 px-3 py-2 border-b cursor-pointer text-[13px]" style={{ borderColor: "rgba(51,65,85,0.2)" }}>
                        <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggle(it)} style={{ accentColor: "var(--ibs-accent)" }} />
                        <span className="flex-1">{it.name}</span>
                        <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{it.unit}</span>
                      </label>
                    ))}
                </div>
              </div>

              {/* PHẢI: đã chọn + nhập số lượng */}
              <div className="flex flex-col min-h-0">
                <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Đã chọn — nhập số lượng ({selectedEntries.length})</div>
                <div className="rounded-lg border overflow-y-auto flex-1" style={{ borderColor: "var(--ibs-border)", maxHeight: 300 }}>
                  {selectedEntries.length === 0 ? <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Tích chọn VPP ở danh sách bên trái</div> :
                    selectedEntries.map(([id, s]) => (
                      <div key={id} className="flex items-center gap-2 px-3 py-2 border-b text-[13px]" style={{ borderColor: "rgba(51,65,85,0.2)" }}>
                        <span className="flex-1 min-w-0 truncate">{s.name}</span>
                        <input value={s.quantity} onChange={(e) => setQty(id, e.target.value)} inputMode="numeric"
                          className="w-16 px-2 py-1 rounded border text-[13px] text-right" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
                        <span className="text-[11px] w-8" style={{ color: "var(--ibs-text-dim)" }}>{s.unit}</span>
                        <button onClick={() => toggle({ id, name: s.name, unit: s.unit, currentStock: 0 } as Item)} style={{ color: "var(--ibs-danger)" }}><X size={14} /></button>
                      </div>
                    ))}
                </div>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (tuỳ chọn)..."
                  className="px-3 py-2 rounded-lg border text-[13px] mt-2" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              </div>
            </div>

            {error && <div className="text-[12px] text-red-500 mt-2">{error}</div>}
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Đang lưu..." : "Lưu yêu cầu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StockInTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showUsage, setShowUsage] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    fetch(`/api/v1/stationery/requests?${params}`).then((r) => r.json())
      .then((res) => { setRequests(res.data || []); setCanApprove(!!res.canApprove); setSelected({}); setQty({}); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [fromDate, toDate]);

  // Cộng dồn VPP còn thiếu (quantity − đã cấp) — CHỈ từ yêu cầu ĐÃ DUYỆT.
  // (Yêu cầu mới tạo / chờ duyệt chỉ hiện ở tab "Phiếu xuất VPP"; duyệt xong mới vào đây.)
  const pending = requests.filter((r) => r.status === "APPROVED");
  const aggMap = new Map<string, { id: string; name: string; unit: string; note?: string | null; remaining: number; requesters: Set<string> }>();
  for (const r of pending) {
    for (const it of r.items) {
      const rem = (it.quantity || 0) - (it.issuedQuantity || 0);
      if (rem <= 0) continue;
      const cur = aggMap.get(it.item.id) || { id: it.item.id, name: it.item.name, unit: it.item.unit, note: it.item.note, remaining: 0, requesters: new Set<string>() };
      cur.remaining += rem;
      cur.requesters.add(`${r.requester?.department?.name ? r.requester.department.name + " - " : ""}${r.requester?.fullName || "—"}`);
      aggMap.set(it.item.id, cur);
    }
  }
  const agg = Array.from(aggMap.values()).filter((a) => a.remaining > 0).sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const toggle = (it: typeof agg[number]) => setSelected((prev) => {
    const next = { ...prev };
    if (next[it.id]) delete next[it.id];
    else { next[it.id] = true; setQty((q) => ({ ...q, [it.id]: q[it.id] ?? String(it.remaining) })); }
    return next;
  });
  const checkedCount = agg.filter((a) => selected[a.id]).length;

  function exportExcel() {
    const rows = agg.map((a) => ({ item: a.name, unit: a.unit, remaining: a.remaining, requesters: Array.from(a.requesters).join(", ") }));
    downloadExcelData(
      `DANH SÁCH YÊU CẦU VPP CHỜ CẤP — ${agg.length} loại`,
      [
        { header: "VPP", key: "item", width: 28 },
        { header: "ĐVT", key: "unit", width: 8 },
        { header: "SL chờ cấp", key: "remaining", width: 12 },
        { header: "Phòng/Người yêu cầu", key: "requesters", width: 40 },
      ],
      rows, "Yêu cầu VPP", "danh-sach-yeu-cau-vpp.xlsx",
    ).catch((e) => alertDialog(e?.message || "Export lỗi"));
  }

  async function issueSelected() {
    const items = agg.filter((a) => selected[a.id]).map((a) => {
      let n = Number(qty[a.id] ?? a.remaining);
      if (!(n > 0)) n = 0;
      if (n > a.remaining) n = a.remaining; // không cấp quá số yêu cầu
      return { itemId: a.id, quantity: n };
    }).filter((x) => x.quantity > 0);
    if (items.length === 0) { await alertDialog("Chọn ít nhất 1 VPP và nhập số lượng cấp > 0"); return; }
    setIssuing(true);
    const res = await fetch("/api/v1/stationery/requests/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    setIssuing(false);
    if (res.ok) load();
    else { const d = await res.json(); await alertDialog(apiError(res.status, d.error)); }
  }

  async function issueAll() {
    if (!(await confirmDialog({ title: "Cấp phát toàn bộ", tone: "default", confirmText: "Cấp phát", message: `Cấp phát TOÀN BỘ ${agg.length} loại VPP (${pending.length} yêu cầu)? Danh sách sẽ trống sau khi cấp.` }))) return;
    setIssuing(true);
    const res = await fetch("/api/v1/stationery/requests/issue-all", { method: "POST" });
    setIssuing(false);
    if (res.ok) load();
    else { const d = await res.json(); await alertDialog(apiError(res.status, d.error)); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
          {agg.length} loại VPP chờ cấp (đã cộng dồn){checkedCount > 0 ? ` · đã chọn ${checkedCount}` : ""}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(""); setToDate(""); }} className="text-[11px]" style={{ color: "var(--ibs-accent)" }}>Xóa lọc</button>
          )}
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg)" }}>
            <Download size={14} /> Export phiếu
          </button>
          <button onClick={() => setShowUsage(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "var(--ibs-bg)" }}>
            <Download size={14} /> Tổng hợp sử dụng
          </button>
          {/* Tab này chỉ hiện với người trong whitelist VPP → ai vào được đều có quyền cấp phát. */}
          {agg.length > 0 && (
            <>
              <button onClick={issueSelected} disabled={issuing || checkedCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "transparent" }}>
                <Check size={14} /> Cấp phát{checkedCount > 0 ? ` (${checkedCount})` : ""}
              </button>
              <button onClick={issueAll} disabled={issuing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--ibs-accent)" }}>
                <Check size={14} /> Cấp phát toàn bộ
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <table className="w-full text-[13px]">
          <thead style={{ background: "rgba(0,180,216,0.05)" }}>
            <tr>
              <th className="px-3 py-3 w-10"></th>
              <th className="px-4 py-3 text-left font-semibold">Tên VPP</th>
              <th className="px-4 py-3 text-left font-semibold">ĐVT</th>
              <th className="px-4 py-3 text-right font-semibold">SL yêu cầu</th>
              <th className="px-4 py-3 text-right font-semibold">SL cấp phát</th>
              <th className="px-4 py-3 text-left font-semibold">Phòng/Người yêu cầu</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</td></tr>
            ) : agg.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--ibs-text-dim)" }}>Chưa có yêu cầu VPP nào chờ cấp</td></tr>
            ) : agg.map((it) => {
              const checked = !!selected[it.id];
              return (
                <tr key={it.id} className="border-t" style={{ borderColor: "var(--ibs-border)", background: checked ? "rgba(0,180,216,0.04)" : undefined }}>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={checked} onChange={() => toggle(it)} style={{ accentColor: "var(--ibs-accent)", width: 16, height: 16 }} />
                  </td>
                  <td className="px-4 py-2.5 font-medium">{it.name}{it.note ? <span className="text-[11px] ml-1" style={{ color: "var(--ibs-text-dim)" }}>({it.note})</span> : null}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{it.unit}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmt(it.remaining)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {checked ? (
                      <input value={qty[it.id] ?? String(it.remaining)} onChange={(e) => setQty((q) => ({ ...q, [it.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                        inputMode="numeric" className="w-20 px-2 py-1 rounded border text-[13px] text-right"
                        style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
                    ) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{Array.from(it.requesters).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showUsage && <UsageReportModal onClose={() => setShowUsage(false)} />}
    </div>
  );
}

function StockInModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ name: string; unit: string; quantity: string; itemId?: string }[]>([{ name: "", unit: "", quantity: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<number, Item[]>>({});

  useEffect(() => {
    fetch("/api/v1/stationery/suppliers").then((r) => r.json()).then((res) => setSuppliers(res.data || []));
  }, []);

  async function searchItem(idx: number, q: string) {
    if (q.length < 2) { setSuggestions((s) => ({ ...s, [idx]: [] })); return; }
    const res = await fetch(`/api/v1/stationery/items?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setSuggestions((s) => ({ ...s, [idx]: res.data || [] }));
  }

  function updateRow(i: number, k: "name" | "unit" | "quantity", v: string) {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    if (k === "name") { next[i].itemId = undefined; searchItem(i, v); }
    setItems(next);
  }
  function selectSuggestion(i: number, it: Item) {
    const next = [...items];
    next[i] = { name: it.name, unit: it.unit, quantity: next[i].quantity, itemId: it.id };
    setItems(next);
    setSuggestions((s) => ({ ...s, [i]: [] }));
  }

  async function submit() {
    setError(null);
    const valid = items.filter((it) => it.name.trim() && it.unit.trim() && Number(it.quantity) > 0);
    if (valid.length === 0) { setError("Cần ít nhất 1 item"); return; }
    if (!supplierName.trim()) { setError("Chưa nhập tên NCC"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/stationery/stock-in", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName.trim(), importDate, notes: notes || null,
          items: valid.map((it) => ({ itemId: it.itemId, name: it.name.trim(), unit: it.unit.trim(), quantity: Number(it.quantity) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, data.error));
      onSuccess();
    } catch (e: any) { setError(String(e.message || e)); } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)" }}>
        <div className="flex justify-between mb-4">
          <h3 className="text-[16px] font-semibold">Nhập kho VPP mới</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="relative">
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>NCC *</label>
            <input
              value={supplierName}
              onChange={(e) => { setSupplierName(e.target.value); setShowSupplierList(true); }}
              onFocus={() => setShowSupplierList(true)}
              onBlur={() => setTimeout(() => setShowSupplierList(false), 200)}
              placeholder="Nhập tên NCC (vd: Super MRO)"
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}
            />
            {showSupplierList && suppliers.filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase())).length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto"
                style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                {suppliers.filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase())).map((s) => (
                  <button key={s.id} type="button" onMouseDown={() => { setSupplierName(s.name); setShowSupplierList(false); }}
                    className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">{s.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày nhập *</label>
            <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
          </div>
        </div>

        <div className="mb-2 text-[12px] font-semibold">Danh sách VPP nhập:</div>
        <div className="space-y-2 mb-3">
          {items.map((it, i) => (
            <div key={i} className="relative grid gap-2" style={{ gridTemplateColumns: "3fr 1fr 1fr auto" }}>
              <div className="relative">
                <input value={it.name} onChange={(e) => updateRow(i, "name", e.target.value)}
                  placeholder="Tên VPP (vd: Giấy A4)" className="w-full px-2 py-1.5 rounded border text-[13px]"
                  style={{ background: "var(--ibs-bg)", borderColor: it.itemId ? "var(--ibs-success)" : "var(--ibs-border)" }} />
                {suggestions[i]?.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto"
                    style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                    {suggestions[i].map((s) => (
                      <button key={s.id} onClick={() => selectSuggestion(i, s)} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">
                        {s.name} <span style={{ color: "var(--ibs-text-dim)" }}>({s.unit}, tồn {fmt(s.currentStock)})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={it.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} placeholder="ĐVT" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <input type="number" value={it.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} placeholder="SL" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}
                className="px-2 text-[18px] opacity-60 hover:opacity-100 disabled:opacity-20">×</button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems([...items, { name: "", unit: "", quantity: "" }])}
          className="text-[12px] mb-4" style={{ color: "var(--ibs-accent)" }}>+ Thêm dòng</button>

        <div className="mb-4">
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
        </div>

        {error && <div className="mb-3 p-2 rounded text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button variant="accent" size="sm" loading={submitting} onClick={submit}>
            {submitting ? "Đang lưu..." : "Lưu phiếu nhập"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RequestsTab({ me }: { me: { id: string; role: string; employeeId: string | null } | null }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusF, setStatusF] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusF) params.set("status", statusF);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    fetch(`/api/v1/stationery/requests?${params}`).then((r) => r.json()).then((res) => {
      setRequests(res.data || []); setCanApprove(!!res.canApprove);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [fromDate, toDate, statusF]);

  function exportExcel() {
    const rows = requests.flatMap((r) => r.items.map((it) => ({
      date: vnDateTime(r.createdAt),
      requester: r.requester.fullName,
      code: r.requester.code,
      department: r.requester.department.name,
      status: STATUS_BADGE[r.status]?.label || r.status,
      reason: r.reason || "",
      item: it.item.name,
      quantity: it.quantity,
      unit: it.item.unit,
    })));
    downloadExcelData(
      `PHIẾU XUẤT VPP — ${requests.length} phiếu`,
      [
        { header: "Ngày tạo", key: "date", width: 18 },
        { header: "Người yêu cầu", key: "requester", width: 22 },
        { header: "Mã NV", key: "code", width: 12 },
        { header: "Phòng ban", key: "department", width: 20 },
        { header: "Trạng thái", key: "status", width: 12 },
        { header: "Lý do", key: "reason", width: 28 },
        { header: "VPP", key: "item", width: 26 },
        { header: "Số lượng", key: "quantity", width: 10 },
        { header: "ĐVT", key: "unit", width: 8 },
      ],
      rows, "Phiếu xuất VPP", "phieu-xuat-vpp.xlsx",
    ).catch((e) => alertDialog(e?.message || "Export lỗi"));
  }

  async function approve(id: string) {
    await fetch(`/api/v1/stationery/requests/${id}/approve`, { method: "POST" });
    load();
  }
  async function reject(id: string) {
    const reason = prompt("Lý do từ chối:");
    if (!reason) return;
    await fetch(`/api/v1/stationery/requests/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    load();
  }
  async function complete(id: string) {
    if (!(await confirmDialog("Xác nhận bạn đã nhận số VPP đã được cấp phát? (chỉ xác nhận phần đã cấp; phần chưa cấp đủ vẫn giữ phiếu lại)"))) return;
    const res = await fetch(`/api/v1/stationery/requests/${id}/complete`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json();
      await alertDialog("Lỗi: " + apiError(res.status, d.error));
      return;
    }
    const d = await res.json().catch(() => null);
    if (d?.meta && d.meta.completed === false) {
      await alertDialog("Đã xác nhận phần được cấp. Phiếu vẫn còn vì chưa được cấp đủ — sẽ xác nhận tiếp khi cấp thêm.");
    }
    load();
  }
  function toggle(id: string) {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpanded(n);
  }

  // Phiếu đã cấp → gom theo NGÀY bấm nút Cấp phát (completedAt). Mỗi nhóm = 1 đợt cấp phát.
  const others = requests.filter((r) => r.status !== "COMPLETED");
  const dateGroups = useMemo(() => {
    const map = new Map<string, Request[]>();
    for (const r of requests.filter((x) => x.status === "COMPLETED")) {
      const d = new Date(r.completedAt || r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, reqs]) => ({ key, label: key.split("-").reverse().join("/"), reqs }));
  }, [requests]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
          {requests.length} phiếu — {canApprove ? "Xem tất cả (toàn quyền)" : "Phiếu của phòng bạn"}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          {(statusF || fromDate || toDate) && (
            <button onClick={() => { setStatusF(""); setFromDate(""); setToDate(""); }} className="text-[11px]" style={{ color: "var(--ibs-accent)" }}>Xóa lọc</button>
          )}
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg)" }}>
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
            style={{ background: "var(--ibs-accent)" }}>
            <Plus size={14} /> Tạo phiếu xuất
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border px-4 py-8 text-center" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đang tải...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border px-4 py-8 text-center" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Chưa có phiếu xuất nào</div>
      ) : (
        <>
          {/* Yêu cầu đang chờ duyệt / chờ cấp */}
          {others.length > 0 && (
            <div className="rounded-xl border mb-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ibs-text-dim)", borderBottom: "1px solid var(--ibs-border)" }}>Đang xử lý</div>
              {others.map((r) => {
                const st = STATUS_BADGE[r.status] || { label: r.status, variant: "default" as const };
                return (
                  <div key={r.id} className="border-b last:border-b-0" style={{ borderColor: "var(--ibs-border)" }}>
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <button onClick={() => toggle(r.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {expanded.has(r.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {r.requester.fullName}
                            <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
                              ({r.requester.code} — {r.requester.department.name})
                            </span>
                          </div>
                          <div className="text-[11px] truncate" style={{ color: "var(--ibs-text-dim)" }}>
                            {new Date(r.createdAt).toLocaleString("vi-VN")} · {r.items.length} mặt hàng{r.reason ? ` · Lý do: ${r.reason}` : ""}
                          </div>
                        </div>
                      </button>

                      <Badge variant={st.variant}>{st.label}</Badge>

                      <div className="flex gap-2 shrink-0 items-center">
                        {r.fileUrl && <a href={viewUrl(r.fileUrl)} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: "var(--ibs-accent)" }}>📎 File</a>}
                        {r.status === "PENDING_APPROVAL" && canApprove && (r.createdById !== me?.id || (me?.role === "BOM" || me?.role === "ADMIN")) && (
                          <>
                            <button onClick={() => approve(r.id)} className="text-[11px] px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>
                              <Check size={12} /> Duyệt
                            </button>
                            <button onClick={() => reject(r.id)} className="text-[11px] px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
                              <X size={12} /> Từ chối
                            </button>
                          </>
                        )}
                        {r.status === "APPROVED" && me?.employeeId === r.requester.id && (
                          r.items.some((it) => (it.issuedQuantity || 0) > (it.confirmedQuantity || 0)) ? (
                            <button onClick={() => complete(r.id)} className="text-[11px] px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1" style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>
                              <Check size={12} /> Xác nhận đã nhận
                            </button>
                          ) : (
                            <span className="text-[11px] px-2 py-1" style={{ color: "var(--ibs-text-dim)" }}>Chờ cấp phát</span>
                          )
                        )}
                      </div>
                    </div>

                    {expanded.has(r.id) && (
                      <div className="px-4 pb-3 pl-10" style={{ background: "rgba(0,0,0,0.03)" }}>
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr style={{ color: "var(--ibs-text-dim)" }}>
                              <th className="px-2 py-1 text-left">VPP</th>
                              <th className="px-2 py-1 text-right">Yêu cầu</th>
                              <th className="px-2 py-1 text-right">Đã cấp</th>
                              <th className="px-2 py-1 text-right">Đã nhận</th>
                              <th className="px-2 py-1 text-left">ĐVT</th>
                              <th className="px-2 py-1 text-left">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map((it, i) => {
                              const issued = it.issuedQuantity || 0;
                              const confirmed = it.confirmedQuantity || 0;
                              const pending = issued > confirmed;
                              return (
                              <tr key={i} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                                <td className="px-2 py-1">{it.item.name}</td>
                                <td className="px-2 py-1 text-right font-semibold">{fmt(it.quantity)}</td>
                                <td className="px-2 py-1 text-right" style={{ color: issued >= it.quantity ? "var(--ibs-success)" : "var(--ibs-warning)" }}>{fmt(issued)}</td>
                                <td className="px-2 py-1 text-right" style={{ color: pending ? "var(--ibs-accent)" : "var(--ibs-text-dim)" }}>{fmt(confirmed)}{pending ? ` (+${fmt(issued - confirmed)})` : ""}</td>
                                <td className="px-2 py-1">{it.item.unit}</td>
                                <td className="px-2 py-1" style={{ color: "var(--ibs-text-dim)" }}>{it.note || "—"}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {r.rejectedReason && <div className="mt-2 text-[12px]" style={{ color: "var(--ibs-danger)" }}>❌ Lý do từ chối: {r.rejectedReason}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Lịch sử cấp phát — gom theo ngày bấm nút Cấp phát */}
          {dateGroups.map((g) => {
            const totalItems = g.reqs.reduce((s, r) => s + r.items.length, 0);
            return (
              <div key={g.key} className="rounded-xl border mb-3" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <button onClick={() => toggle(g.key)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
                  {expanded.has(g.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Package size={15} style={{ color: "var(--ibs-accent)" }} />
                  <span className="font-semibold">Cấp phát vật tư ngày {g.label}</span>
                  <span className="ml-auto text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{g.reqs.length} nhân viên · {totalItems} mặt hàng</span>
                </button>

                {expanded.has(g.key) && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--ibs-border)" }}>
                    {g.reqs.map((r) => (
                      <div key={r.id} className="pt-3">
                        <div className="font-semibold text-[13px]">
                          {r.requester.fullName}
                          <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
                            ({r.requester.code} — {r.requester.department.name})
                          </span>
                        </div>
                        <table className="w-full text-[12px] mt-1">
                          <thead>
                            <tr style={{ color: "var(--ibs-text-dim)" }}>
                              <th className="px-2 py-1 text-left">VPP</th>
                              <th className="px-2 py-1 text-right">SL</th>
                              <th className="px-2 py-1 text-left">ĐVT</th>
                              <th className="px-2 py-1 text-left">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map((it, i) => (
                              <tr key={i} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                                <td className="px-2 py-1">{it.item.name}</td>
                                <td className="px-2 py-1 text-right font-semibold">{fmt(it.quantity)}</td>
                                <td className="px-2 py-1">{it.item.unit}</td>
                                <td className="px-2 py-1" style={{ color: "var(--ibs-text-dim)" }}>{it.note || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {showNew && <RequestModal onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

// Modal EXPORT TỔNG HỢP SỬ DỤNG VPP theo phòng ban + kỳ (tháng/quý/năm).
function UsageReportModal({ onClose }: { onClose: () => void }) {
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [periodType, setPeriodType] = useState<"month" | "quarter" | "year">("month");
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepts(res.data || [])).catch(() => {});
  }, []);

  function range(): { from: string; to: string; label: string } {
    const p = (n: number) => String(n).padStart(2, "0");
    const last = (y: number, m: number) => new Date(y, m, 0).getDate(); // số ngày cuối tháng m (1-12)
    if (periodType === "month") {
      const [y, m] = month.split("-").map(Number);
      return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last(y, m))}`, label: `Tháng ${m}/${y}` };
    }
    if (periodType === "quarter") {
      const m1 = (quarter - 1) * 3 + 1, m3 = m1 + 2;
      return { from: `${year}-${p(m1)}-01`, to: `${year}-${p(m3)}-${p(last(year, m3))}`, label: `Quý ${quarter}/${year}` };
    }
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Năm ${year}` };
  }

  async function doExport() {
    setError(null); setLoading(true);
    try {
      const { from, to, label } = range();
      const qs = new URLSearchParams({ from, to });
      if (departmentId) qs.set("departmentId", departmentId);
      const res = await fetch(`/api/v1/stationery/usage-report?${qs}`);
      const json = await res.json();
      if (!res.ok) { setError(apiError(res.status, json?.error)); return; }
      const rows: { name: string; unit: string; total: number }[] = json.data || [];
      if (rows.length === 0) { setError("Kỳ này phòng ban chưa sử dụng VPP nào."); return; }
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Tổng hợp VPP");
      ws.mergeCells("A1:C1");
      ws.getCell("A1").value = `TỔNG HỢP SỬ DỤNG VPP — ${json.departmentName} — ${label}`;
      ws.getCell("A1").font = { bold: true, size: 13 };
      ws.addRow([]);
      ws.addRow(["STT", "Tên VPP", "Đơn vị tính", "Số lượng đã dùng"]);
      ws.getRow(3).font = { bold: true };
      ws.columns = [{ width: 6 }, { width: 36 }, { width: 14 }, { width: 18 }];
      rows.forEach((r, i) => ws.addRow([i + 1, r.name, r.unit, r.total]));
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `tong-hop-vpp-${label.replace(/[\s/]/g, "")}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
      onClose();
    } catch { setError("Lỗi kết nối"); }
    finally { setLoading(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const labelCls = "block text-[12px] font-semibold mb-1.5";
  const labelStyle = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--ibs-bg-card)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-bold">Tổng hợp sử dụng VPP</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls} style={labelStyle}>Phòng ban</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Tất cả phòng ban</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Kỳ</label>
            <select value={periodType} onChange={(e) => setPeriodType(e.target.value as any)} className={inputCls} style={inputStyle}>
              <option value="month">Tháng</option>
              <option value="quarter">Quý</option>
              <option value="year">Năm</option>
            </select>
          </div>
          {periodType === "month" && (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} style={inputStyle} />
          )}
          {periodType === "quarter" && (
            <div className="flex gap-2">
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={inputCls} style={inputStyle}>
                {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Quý {q}</option>)}
              </select>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls} style={inputStyle} />
            </div>
          )}
          {periodType === "year" && (
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls} style={inputStyle} />
          )}
          {error && <div className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Huỷ</button>
            <button onClick={doExport} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--ibs-accent)", opacity: loading ? 0.6 : 1 }}>
              <Download size={14} /> {loading ? "Đang xuất..." : "Export Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requesterId, setRequesterId] = useState("");
  const [reason, setReason] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<{ itemId?: string; name: string; unit: string; quantity: string; note: string; currentStock?: number }[]>([{ name: "", unit: "", quantity: "", note: "" }]);
  const [suggestions, setSuggestions] = useState<Record<number, Item[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/employees?limit=500").then((r) => r.json()).then((res) => setEmployees(res.data || []));
  }, []);

  async function searchItem(idx: number, q: string) {
    if (q.length < 2) { setSuggestions((s) => ({ ...s, [idx]: [] })); return; }
    const res = await fetch(`/api/v1/stationery/items?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setSuggestions((s) => ({ ...s, [idx]: res.data || [] }));
  }
  function updateRow(i: number, k: "name" | "unit" | "quantity" | "note", v: string) {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    if (k === "name") { next[i].itemId = undefined; next[i].currentStock = undefined; searchItem(i, v); }
    setItems(next);
  }
  function selectSuggestion(i: number, it: Item) {
    const next = [...items];
    next[i] = { itemId: it.id, name: it.name, unit: it.unit, quantity: next[i].quantity, note: next[i].note, currentStock: it.currentStock };
    setItems(next);
    setSuggestions((s) => ({ ...s, [i]: [] }));
  }

  async function uploadFile(f: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("bucket", "hr-documents");
    fd.append("folder", "stationery-requests");
    try {
      const res = await fetch("/api/v1/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, d.error));
      setFileUrl(d.data?.url || d.url || "");
    } catch (e: any) { setError(String(e.message || e)); } finally { setUploading(false); }
  }

  async function submit() {
    setError(null);
    if (!requesterId) { setError("Chưa chọn NV yêu cầu"); return; }
    if (!reason.trim()) { setError("Chưa nhập lý do"); return; }
    if (!fileUrl) { setError("Bắt buộc upload file Đề nghị VPP"); return; }
    const valid = items.filter((it) => it.itemId && Number(it.quantity) > 0);
    if (valid.length === 0) { setError("Chọn ít nhất 1 mặt hàng có sẵn trong kho"); return; }
    for (const it of valid) {
      if ((it.currentStock ?? 0) < Number(it.quantity)) {
        setError(`"${it.name}" chỉ còn ${it.currentStock} ${it.unit} (yêu cầu ${it.quantity})`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/stationery/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterEmployeeId: requesterId, reason: reason.trim(), fileUrl,
          items: valid.map((it) => ({ itemId: it.itemId, quantity: Number(it.quantity), note: it.note || null })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(res.status, d.error));
      onSuccess();
    } catch (e: any) { setError(String(e.message || e)); } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)" }}>
        <div className="flex justify-between mb-4">
          <h3 className="text-[16px] font-semibold">Tạo phiếu xuất VPP</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>NV yêu cầu *</label>
            <select value={requesterId} onChange={(e) => setRequesterId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }}>
              <option value="">-- Chọn NV --</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code} — {e.department.name})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>File Đề nghị VPP * (Word/PDF)</label>
            <input type="file" accept=".doc,.docx,.pdf,.jpg,.png" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
              className="w-full text-[13px]" />
            {uploading && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Đang upload...</div>}
            {fileUrl && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-success)" }}>✓ Đã upload</div>}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[12px] mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Lý do đề xuất *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-[13px]"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} placeholder="VD: Phục vụ in tài liệu họp tháng" />
        </div>

        <div className="mb-2 text-[12px] font-semibold">Danh sách VPP yêu cầu (gõ ≥2 ký tự để tìm trong kho):</div>
        <div className="space-y-2 mb-3">
          {items.map((it, i) => (
            <div key={i} className="relative grid gap-2" style={{ gridTemplateColumns: "3fr 1fr 1fr 2fr auto" }}>
              <div className="relative">
                <input value={it.name} onChange={(e) => updateRow(i, "name", e.target.value)}
                  placeholder="Tìm tên VPP trong kho..." className="w-full px-2 py-1.5 rounded border text-[13px]"
                  style={{ background: "var(--ibs-bg)", borderColor: it.itemId ? "var(--ibs-success)" : "var(--ibs-border)" }} />
                {suggestions[i]?.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-lg max-h-40 overflow-y-auto"
                    style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                    {suggestions[i].map((s) => (
                      <button key={s.id} onClick={() => selectSuggestion(i, s)} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">
                        {s.name} <span style={{ color: "var(--ibs-text-dim)" }}>({s.unit}, tồn {fmt(s.currentStock)})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={it.unit} readOnly placeholder="ĐVT" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "rgba(0,0,0,0.05)", borderColor: "var(--ibs-border)" }} />
              <input type="number" value={it.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} placeholder="SL" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <input value={it.note} onChange={(e) => updateRow(i, "note", e.target.value)} placeholder="Ghi chú" className="px-2 py-1.5 rounded border text-[13px]"
                style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)" }} />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}
                className="px-2 text-[18px] opacity-60 hover:opacity-100 disabled:opacity-20">×</button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems([...items, { name: "", unit: "", quantity: "", note: "" }])}
          className="text-[12px] mb-4" style={{ color: "var(--ibs-accent)" }}>+ Thêm dòng</button>

        {error && <div className="mb-3 p-2 rounded text-[13px]" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button variant="accent" size="sm" loading={submitting} onClick={submit}>
            {submitting ? "Đang gửi..." : "Gửi phiếu xuất"}
          </Button>
        </div>
      </div>
    </div>
  );
}
