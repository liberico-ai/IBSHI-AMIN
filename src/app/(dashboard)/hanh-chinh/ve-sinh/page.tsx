"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, RefreshCw, X, CheckCircle, ClipboardList } from "lucide-react";
import Link from "next/link";

type CleaningZone = { id: string; name: string; location: string; frequency: string; assignedTo?: string; isActive: boolean };
type CleaningSchedule = {
  id: string; zoneId: string; scheduledDate: string; completedAt?: string;
  completedBy?: string; status: string; notes?: string;
  zone: { name: string; location: string };
  completedByEmployee?: { fullName: string };
};
type CleaningLog = {
  id: string; zoneId: string; date: string; status: string; score: number | null;
  photoUrls: string[]; note: string | null; checkedBy: string; createdAt: string;
  zone: { id: string; name: string; location: string };
};
type CleaningIssue = {
  id: string; reportedBy: string; zoneName: string; description: string;
  status: string; assignedTo: string | null; resolvedAt: string | null; createdAt: string;
  reporter: { code: string; fullName: string; department: { name: string } };
};

const FREQUENCY_LABELS: Record<string, string> = { DAILY: "Hàng ngày", WEEKLY: "Hàng tuần", MONTHLY: "Hàng tháng" };
const LOG_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: "Đạt", color: "var(--ibs-success)" },
  NEEDS_IMPROVEMENT: { label: "Cần cải thiện", color: "var(--ibs-warning)" },
  MISSED: { label: "Bỏ sót", color: "var(--ibs-danger)" },
};
const ISSUE_STATUS: Record<string, { label: string; color: string }> = {
  REPORTED: { label: "Mới báo", color: "var(--ibs-warning)" },
  IN_PROGRESS: { label: "Đang xử lý", color: "var(--ibs-accent)" },
  RESOLVED: { label: "Đã xử lý", color: "var(--ibs-success)" },
};
const SCHEDULE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chưa làm", color: "var(--ibs-warning)" },
  COMPLETED: { label: "Đã hoàn thành", color: "var(--ibs-success)" },
  SKIPPED: { label: "Bỏ qua", color: "#6b7280" },
};

export default function VeSinhPage() {
  const [tab, setTab] = useState<"schedule" | "logs" | "issues" | "zones">("schedule");
  const [zones, setZones] = useState<CleaningZone[]>([]);
  const [schedules, setSchedules] = useState<CleaningSchedule[]>([]);
  const [logs, setLogs] = useState<CleaningLog[]>([]);
  const [issues, setIssues] = useState<CleaningIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [showNewZone, setShowNewZone] = useState(false);
  const [showNewSchedule, setShowNewSchedule] = useState(false);
  const [showNewLog, setShowNewLog] = useState(false);
  const [showNewIssue, setShowNewIssue] = useState(false);

  function fetchZones() {
    setLoading(true);
    fetch("/api/v1/cleaning")
      .then((r) => r.json()).then((res) => setZones(res.data || []))
      .finally(() => setLoading(false));
  }

  function fetchSchedules() {
    setLoading(true);
    fetch(`/api/v1/cleaning?date=${selectedDate}`)
      .then((r) => r.json()).then((res) => setSchedules(res.schedules || []))
      .finally(() => setLoading(false));
  }

  function fetchLogs() {
    fetch(`/api/v1/cleaning/logs?date=${selectedDate}`)
      .then((r) => r.json()).then((res) => setLogs(res.data || []));
  }

  function fetchIssues() {
    fetch("/api/v1/cleaning/issues")
      .then((r) => r.json()).then((res) => setIssues(res.data || []));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      setUserRole(res.data?.role || "");
      setMyEmployeeId(res.data?.employeeId || null);
    });
    fetchZones();
  }, []);

  useEffect(() => {
    if (tab === "schedule") fetchSchedules();
    if (tab === "logs") fetchLogs();
    if (tab === "issues") fetchIssues();
  }, [tab, selectedDate]);

  const canManage = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "MANAGER";

  async function handleComplete(id: string) {
    await fetch(`/api/v1/cleaning/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "COMPLETE" }),
    });
    fetchSchedules();
  }

  const completedCount = schedules.filter((s) => s.status === "COMPLETED").length;
  const pendingCount = schedules.filter((s) => s.status === "PENDING").length;
  const completionRate = schedules.length > 0 ? Math.round((completedCount / schedules.length) * 100) : 0;
  const scoredLogs = logs.filter((l) => l.score != null);
  const avgScore = scoredLogs.length > 0 ? Math.round(scoredLogs.reduce((s, l) => s + l.score!, 0) / scoredLogs.length) : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/hanh-chinh" className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>← Hành chính</Link>
      </div>
      <PageTitle title="Vệ sinh" description="Lịch vệ sinh và kiểm tra khu vực làm việc" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-5">
        {[
          { label: "Tổng khu vực", value: zones.filter((z) => z.isActive).length, color: "var(--ibs-text)" },
          { label: "Hoàn thành hôm nay", value: completedCount, color: "var(--ibs-success)" },
          { label: "Chưa làm", value: pendingCount, color: "var(--ibs-warning)" },
          { label: "Tỷ lệ hoàn thành", value: `${completionRate}%`, color: completionRate >= 80 ? "var(--ibs-success)" : completionRate >= 50 ? "var(--ibs-warning)" : "var(--ibs-danger)" },
          { label: "Điểm TB chất lượng", value: avgScore != null ? `${avgScore}/100` : "—", color: avgScore == null ? "var(--ibs-text-dim)" : avgScore >= 80 ? "var(--ibs-success)" : avgScore >= 60 ? "var(--ibs-warning)" : "var(--ibs-danger)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
            <div className="text-[28px] font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {tab === "schedule" && schedules.length > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold">Tiến độ ngày {formatDate(selectedDate)}</span>
            <span className="text-[13px] font-bold" style={{ color: completionRate >= 80 ? "var(--ibs-success)" : "var(--ibs-warning)" }}>{completionRate}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--ibs-border)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${completionRate}%`, background: completionRate >= 80 ? "var(--ibs-success)" : completionRate >= 50 ? "var(--ibs-warning)" : "var(--ibs-danger)" }} />
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>{completedCount}/{schedules.length} khu vực hoàn thành</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit flex-wrap" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        {(["schedule", "logs", "issues", "zones"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "schedule" ? "Lịch hôm nay" : t === "logs" ? "Nhật ký kiểm tra" : t === "issues" ? `Phản ánh${issues.filter(i => i.status !== "RESOLVED").length > 0 ? ` (${issues.filter(i => i.status !== "RESOLVED").length})` : ""}` : "Khu vực"}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Lịch vệ sinh</div>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            <button onClick={fetchSchedules} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {canManage && (
              <button onClick={() => setShowNewSchedule(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Thêm lịch
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Khu vực</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Vị trí</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Trạng thái</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Hoàn thành lúc</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const st = SCHEDULE_STATUS[s.status] || { label: s.status, color: "#6b7280" };
                return (
                  <tr key={s.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)", background: s.status === "COMPLETED" ? "rgba(34,197,94,0.03)" : undefined }}>
                    <td className="px-5 py-2.5 font-medium">{s.zone.name}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{s.zone.location}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${st.color}20`, color: st.color }}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>
                      {s.completedAt ? formatDateTime(s.completedAt) : "—"}
                      {s.completedByEmployee && <div className="text-[11px]">{s.completedByEmployee.fullName}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {s.status === "PENDING" && (
                        <button onClick={() => handleComplete(s.id)} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>
                          <CheckCircle size={11} /> Xong
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {schedules.length === 0 && !loading && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có lịch vệ sinh cho ngày này</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "zones" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-semibold">Danh sách khu vực</div>
            {canManage && (
              <button onClick={() => setShowNewZone(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Thêm khu vực
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {zones.map((z) => (
              <div key={z.id} className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", opacity: z.isActive ? 1 : 0.5 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[14px]">{z.name}</span>
                  {!z.isActive && <span className="text-[11px] px-2 py-0.5 rounded-lg" style={{ background: "rgba(107,114,128,0.1)", color: "#6b7280" }}>Không hoạt động</span>}
                </div>
                <div className="text-[12px] mb-2" style={{ color: "var(--ibs-text-dim)" }}>{z.location}</div>
                <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>Tần suất: {FREQUENCY_LABELS[z.frequency] || z.frequency}</div>
                {z.assignedTo && <div className="text-[11px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>Phụ trách: {z.assignedTo}</div>}
              </div>
            ))}
            {zones.length === 0 && !loading && (
              <div className="col-span-2 rounded-xl border flex items-center justify-center py-16" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <span className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có khu vực vệ sinh nào</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Nhật ký kiểm tra vệ sinh</div>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-[12px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            <button onClick={fetchLogs} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {canManage && (
              <button onClick={() => setShowNewLog(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Ghi nhận
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Khu vực</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Trạng thái</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Điểm</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Người kiểm tra</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const ls = LOG_STATUS[log.status] || { label: log.status, color: "#6b7280" };
                return (
                  <tr key={log.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                    <td className="px-5 py-2.5 font-medium">
                      {log.zone.name}
                      <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>{log.zone.location}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${ls.color}20`, color: ls.color }}>{ls.label}</span>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{log.score != null ? `${log.score}/100` : "—"}</td>
                    <td className="px-3 py-2.5">{log.checkedBy}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{log.note || "—"}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có nhật ký kiểm tra cho ngày này</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "issues" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b flex-wrap" style={{ borderColor: "var(--ibs-border)" }}>
            <div className="text-[14px] font-semibold">Phản ánh vệ sinh</div>
            <button onClick={fetchIssues} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {myEmployeeId && (
              <button onClick={() => setShowNewIssue(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                <Plus size={14} /> Báo phản ánh
              </button>
            )}
          </div>
          <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
            {issues.length === 0 && (
              <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có phản ánh nào</div>
            )}
            {issues.map((issue) => {
              const is = ISSUE_STATUS[issue.status] || { label: issue.status, color: "#6b7280" };
              return (
                <div key={issue.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-[13px]">{issue.zoneName}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${is.color}20`, color: is.color }}>{is.label}</span>
                    </div>
                    <div className="text-[12px] mb-1">{issue.description}</div>
                    <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                      {issue.reporter.fullName} · {issue.reporter.department.name} · {new Date(issue.createdAt).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                  {canManage && issue.status !== "RESOLVED" && (
                    <div className="flex gap-1 shrink-0">
                      {issue.status === "REPORTED" && (
                        <button onClick={async () => {
                          await fetch(`/api/v1/cleaning/issues/${issue.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
                          fetchIssues();
                        }} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>Nhận xử lý</button>
                      )}
                      {issue.status === "IN_PROGRESS" && (
                        <button onClick={async () => {
                          await fetch(`/api/v1/cleaning/issues/${issue.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "RESOLVED" }) });
                          fetchIssues();
                        }} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "var(--ibs-success)" }}>Đã xử lý</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNewZone && (
        <NewZoneModal onClose={() => setShowNewZone(false)} onSuccess={() => { setShowNewZone(false); fetchZones(); }} />
      )}
      {showNewSchedule && (
        <NewScheduleModal zones={zones} selectedDate={selectedDate} onClose={() => setShowNewSchedule(false)} onSuccess={() => { setShowNewSchedule(false); fetchSchedules(); }} />
      )}
      {showNewLog && (
        <NewLogModal zones={zones} selectedDate={selectedDate} onClose={() => setShowNewLog(false)} onSuccess={() => { setShowNewLog(false); fetchLogs(); }} />
      )}
      {showNewIssue && myEmployeeId && (
        <NewIssueModal employeeId={myEmployeeId} zones={zones} onClose={() => setShowNewIssue(false)} onSuccess={() => { setShowNewIssue(false); fetchIssues(); }} />
      )}
    </div>
  );
}

function NewZoneModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", location: "", frequency: "DAILY", assignedTo: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const body: any = { ...form };
    if (!body.assignedTo) delete body.assignedTo;
    await fetch("/api/v1/cleaning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Thêm khu vực vệ sinh</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tên khu vực *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Vị trí *</label>
            <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Tần suất</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Người phụ trách</label>
              <input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Thêm"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewLogModal({ zones, selectedDate, onClose, onSuccess }: { zones: CleaningZone[]; selectedDate: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ zoneId: "", date: selectedDate, status: "COMPLETED", score: "", note: "", checkedBy: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const body: any = { ...form, photoUrls: [] };
    if (body.score) body.score = parseInt(body.score, 10); else delete body.score;
    if (!body.note) delete body.note;
    await fetch("/api/v1/cleaning/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false); onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Ghi nhận kiểm tra vệ sinh</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Khu vực *</label>
            <select required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn khu vực...</option>
              {zones.filter((z) => z.isActive).map((z) => <option key={z.id} value={z.id}>{z.name} — {z.location}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Kết quả</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Object.entries(LOG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Điểm (0-100)</label>
              <input type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} placeholder="Tùy chọn" />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Người kiểm tra *</label>
              <input required value={form.checkedBy} onChange={(e) => setForm({ ...form, checkedBy: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú</label>
            <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Ghi nhận"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewIssueModal({ employeeId, zones, onClose, onSuccess }: { employeeId: string; zones: CleaningZone[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ zoneName: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/v1/cleaning/issues", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedBy: employeeId, zoneName: form.zoneName, description: form.description }),
    });
    setSaving(false); onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Báo phản ánh vệ sinh</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Khu vực *</label>
            <input required value={form.zoneName} onChange={(e) => setForm({ ...form, zoneName: e.target.value })}
              list="zone-names" placeholder="Nhập hoặc chọn khu vực..."
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            <datalist id="zone-names">{zones.map((z) => <option key={z.id} value={z.name} />)}</datalist>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Mô tả vấn đề *</label>
            <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="VD: Vòi nước bị rỉ, sàn ướt..."
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang gửi..." : "Gửi phản ánh"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewScheduleModal({ zones, selectedDate, onClose, onSuccess }: { zones: CleaningZone[]; selectedDate: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ zoneId: "", scheduledDate: selectedDate });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/v1/cleaning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5"><div className="text-[16px] font-bold">Thêm lịch vệ sinh</div><button onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Khu vực *</label>
            <select required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn khu vực...</option>
              {zones.filter((z) => z.isActive).map((z) => <option key={z.id} value={z.id}>{z.name} — {z.location}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày</label>
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>{saving ? "Đang lưu..." : "Thêm"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
