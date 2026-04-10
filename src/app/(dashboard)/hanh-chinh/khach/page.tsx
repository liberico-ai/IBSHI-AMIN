"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, RefreshCw, X, UserCheck, UserX, LogIn, LogOut } from "lucide-react";
import Link from "next/link";

type Employee = { id: string; code: string; fullName: string; department: { name: string } };
type VisitorRequest = {
  id: string; visitorName: string; visitorCompany?: string; visitorPhone: string;
  purpose: string; visitDate: string; status: string; badgeNumber?: string;
  checkedInAt?: string; checkedOutAt?: string; notes?: string;
  host: { code: string; fullName: string; department: { name: string } };
};

const VISITOR_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ xử lý", color: "var(--ibs-warning)" },
  CHECKED_IN: { label: "Đã vào", color: "var(--ibs-success)" },
  CHECKED_OUT: { label: "Đã ra", color: "#6b7280" },
  REJECTED: { label: "Từ chối", color: "var(--ibs-danger)" },
};
const VISITOR_PURPOSE_LABELS: Record<string, string> = {
  FACTORY_TOUR: "Tham quan nhà máy",
  AUDIT: "Kiểm toán/Audit",
  SURVEY: "Khảo sát",
  BUSINESS: "Giao dịch",
  DELIVERY: "Giao hàng",
  OTHER: "Khác",
};

export default function KhachPage() {
  const [visitors, setVisitors] = useState<VisitorRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState("");

  function fetchVisitors() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDate) params.set("date", filterDate);
    if (filterStatus) params.set("status", filterStatus);
    fetch(`/api/v1/visitors?${params}`)
      .then((r) => r.json()).then((res) => setVisitors(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res.data?.role || ""));
    fetch("/api/v1/employees?limit=300").then((r) => r.json()).then((res) => setEmployees(res.data || []));
  }, []);
  useEffect(() => { fetchVisitors(); }, [filterDate, filterStatus]);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "MANAGER";

  async function handleAction(id: string, action: string) {
    let badge: string | undefined;
    if (action === "CHECK_IN") {
      const b = prompt("Số thẻ khách (tuỳ chọn):");
      badge = b || undefined;
    }
    await fetch(`/api/v1/visitors/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, badgeNumber: badge }),
    });
    fetchVisitors();
  }

  const pendingCount = visitors.filter((v) => v.status === "PENDING").length;
  const checkedInCount = visitors.filter((v) => v.status === "CHECKED_IN").length;

  const columns: Column<VisitorRequest>[] = [
    { key: "visitorName", header: "Tên khách", render: (v) => <div><div className="font-semibold">{v.visitorName}</div>{v.visitorCompany && <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{v.visitorCompany}</div>}</div> },
    { key: "visitorPhone", header: "SĐT", render: (v) => v.visitorPhone },
    { key: "host", header: "Gặp", render: (v) => <div><div className="font-medium">{v.host.fullName}</div><div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{v.host.department.name}</div></div> },
    { key: "purpose", header: "Mục đích", render: (v) => <span className="text-[12px]">{VISITOR_PURPOSE_LABELS[v.purpose] ?? v.purpose}</span> },
    { key: "visitDate", header: "Ngày hẹn", render: (v) => formatDate(v.visitDate) },
    { key: "status", header: "Trạng thái", render: (v) => {
      const s = VISITOR_STATUS[v.status] || { label: v.status, color: "#6b7280" };
      return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${s.color}20`, color: s.color }}>{s.label}</span>;
    }},
    { key: "badge", header: "Thẻ", render: (v) => v.badgeNumber ? <span className="font-mono text-[12px]">{v.badgeNumber}</span> : <span style={{ color: "var(--ibs-text-dim)" }}>—</span> },
    { key: "actions", header: "", render: (v) => canManage ? (
      <div className="flex gap-1">
        {v.status === "PENDING" && <>
          <button onClick={() => handleAction(v.id, "CHECK_IN")} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}><LogIn size={11} /> Vào</button>
          <button onClick={() => handleAction(v.id, "REJECT")} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}><UserX size={11} /></button>
        </>}
        {v.status === "CHECKED_IN" && (
          <button onClick={() => handleAction(v.id, "CHECK_OUT")} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}><LogOut size={11} /> Ra</button>
        )}
      </div>
    ) : null },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/hanh-chinh" className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>← Hành chính</Link>
      </div>
      <PageTitle title="Đăng ký khách" description="Quản lý khách thăm quan, nhà thầu và đối tác" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-4">
        {[
          { label: "Tổng hôm nay", value: visitors.length, color: "var(--ibs-text)" },
          { label: "Đang trong nhà máy", value: checkedInCount, color: "var(--ibs-success)" },
          { label: "Chờ xử lý", value: pendingCount, color: "var(--ibs-warning)" },
          { label: "Đã ra", value: visitors.filter((v) => v.status === "CHECKED_OUT").length, color: "#6b7280" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
            <div className="text-[28px] font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[14px] font-semibold">Danh sách khách</div>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(VISITOR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={fetchVisitors} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <Plus size={14} /> Đăng ký khách
          </button>
        </div>
        <DataTable columns={columns} data={visitors} loading={loading} emptyText="Không có khách nào" />
      </div>

      {showNew && (
        <NewVisitorModal employees={employees} onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); fetchVisitors(); }} />
      )}
    </div>
  );
}

function NewVisitorModal({ employees, onClose, onSuccess }: { employees: Employee[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ visitorName: "", visitorCompany: "", visitorPhone: "", hostEmployeeId: "", visitDate: new Date().toISOString().slice(0, 16), purpose: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const body: any = { ...form };
    if (!body.visitorCompany) delete body.visitorCompany;
    if (!body.notes) delete body.notes;
    const res = await fetch("/api/v1/visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(d.error?.message || "Có lỗi xảy ra"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Đăng ký khách thăm quan</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tên khách *</label>
              <input required value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} /></div>
            <div><label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>SĐT *</label>
              <input required value={form.visitorPhone} onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} /></div>
          </div>
          <div><label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Công ty / Đơn vị</label>
            <input value={form.visitorCompany} onChange={(e) => setForm({ ...form, visitorCompany: e.target.value })} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} /></div>
          <div><label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Gặp nhân viên *</label>
            <select required value={form.hostEmployeeId} onChange={(e) => setForm({ ...form, hostEmployeeId: e.target.value })} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn nhân viên được thăm...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code}) — {emp.department.name}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Thời gian hẹn *</label>
              <input required type="datetime-local" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} /></div>
            <div><label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mục đích *</label>
              <select required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                <option value="">-- Chọn --</option>
                {Object.entries(VISITOR_PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Đăng ký"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
