"use client";

import { useState, useEffect, useMemo } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, Check, X, RefreshCw, CalendarDays, Clock, Download } from "lucide-react";

type LeaveRequest = {
  id: string; leaveType: string; startDate: string; endDate: string;
  totalDays: number; reason: string; status: string;
  employee: { code: string; fullName: string; department: { name: string } };
};
type OTRequest = {
  id: string; date: string; startTime: string; endTime: string;
  hours: number; reason: string; status: string; otRate: number;
  employee: { code: string; fullName: string; department: { name: string } };
};
type AttendanceSummary = { departmentId: string; departmentName: string; present: number; total: number; rate: number };
type AttendanceRecord = {
  id: string; date: string; status: string; checkIn?: string; checkOut?: string;
  workHours: number; otHours: number; note?: string;
  employee: { code: string; fullName: string; department: { name: string } };
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Phép năm", SICK: "Nghỉ ốm", PERSONAL: "Việc cá nhân",
  WEDDING: "Cưới", FUNERAL: "Tang", MATERNITY: "Thai sản", PATERNITY: "Nghỉ bố", UNPAID: "Không lương",
};
const ATTENDANCE_SYMBOL: Record<string, { symbol: string; color: string }> = {
  PRESENT:           { symbol: "P",  color: "var(--ibs-success)" },
  ABSENT_APPROVED:   { symbol: "NP", color: "var(--ibs-accent)" },
  ABSENT_UNAPPROVED: { symbol: "NK", color: "var(--ibs-danger)" },
  LATE:              { symbol: "M",  color: "var(--ibs-warning)" },
  BUSINESS_TRIP:     { symbol: "CT", color: "var(--ibs-accent)" },
  HALF_DAY:          { symbol: "½",  color: "var(--ibs-warning)" },
};

type Tab = "attendance" | "grid" | "leave" | "ot";

export default function AttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<Tab>("attendance");
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [otRequests, setOTRequests] = useState<OTRequest[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [loadingOT, setLoadingOT] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showOTForm, setShowOTForm] = useState(false);
  const [userLeaveBalance, setUserLeaveBalance] = useState<number | null>(null);

  useEffect(() => {
    setLoadingSummary(true);
    fetch("/api/v1/attendance?summary=true")
      .then((r) => r.json()).then((res) => setSummary(res.data || []))
      .finally(() => setLoadingSummary(false));
  }, [month, year]);

  useEffect(() => {
    setLoadingLeave(true);
    fetch("/api/v1/leave-requests")
      .then((r) => r.json()).then((res) => setLeaveRequests(res.data || []))
      .finally(() => setLoadingLeave(false));
  }, []);

  useEffect(() => {
    setLoadingOT(true);
    fetch("/api/v1/ot-requests")
      .then((r) => r.json()).then((res) => setOTRequests(res.data || []))
      .finally(() => setLoadingOT(false));
  }, []);

  useEffect(() => {
    if (activeTab !== "grid") return;
    setLoadingGrid(true);
    fetch(`/api/v1/attendance?month=${month}&year=${year}`)
      .then((r) => r.json()).then((res) => setAttendanceRecords(res.data || []))
      .finally(() => setLoadingGrid(false));
  }, [activeTab, month, year]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const totalPresent = summary.reduce((s, d) => s + d.present, 0);
  const totalHeadcount = summary.reduce((s, d) => s + d.total, 0);
  const pendingLeaveCount = useMemo(() => leaveRequests.filter((lr) => lr.status === "PENDING").length, [leaveRequests]);
  const pendingOTCount = useMemo(() => otRequests.filter((o) => o.status === "PENDING").length, [otRequests]);

  // Build monthly grid data
  const daysInMonth = new Date(year, month, 0).getDate();
  const gridEmployees = useMemo(() => {
    const map = new Map<string, { code: string; fullName: string; dept: string; days: Record<number, AttendanceRecord> }>();
    attendanceRecords.forEach((r) => {
      const day = new Date(r.date).getDate();
      if (!map.has(r.employee.code)) {
        map.set(r.employee.code, { code: r.employee.code, fullName: r.employee.fullName, dept: r.employee.department?.name, days: {} });
      }
      map.get(r.employee.code)!.days[day] = r;
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [attendanceRecords]);

  async function handleLeaveAction(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch(`/api/v1/leave-requests/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setLeaveRequests((prev) => prev.map((lr) =>
        lr.id === id ? { ...lr, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } : lr
      ));
    }
  }

  async function handleOTAction(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch(`/api/v1/ot-requests/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setOTRequests((prev) => prev.map((o) =>
        o.id === id ? { ...o, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } : o
      ));
    }
  }

  async function exportGrid() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Bảng công T${month}/${year}`);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    ws.columns = [
      { header: "Mã NV", key: "code", width: 8 },
      { header: "Họ tên", key: "name", width: 20 },
      ...days.map((d) => ({ header: String(d), key: `d${d}`, width: 4 })),
      { header: "Tổng công", key: "total", width: 9 },
    ];
    ws.getRow(1).font = { bold: true };
    gridEmployees.forEach((emp) => {
      const row: Record<string, unknown> = { code: emp.code, name: emp.fullName };
      let total = 0;
      days.forEach((d) => {
        const r = emp.days[d];
        const sym = r ? (ATTENDANCE_SYMBOL[r.status]?.symbol || r.status) : "";
        row[`d${d}`] = sym;
        if (r?.status === "PRESENT" || r?.status === "LATE") total++;
        if (r?.status === "HALF_DAY") total += 0.5;
      });
      row.total = total;
      ws.addRow(row);
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `bang-cong-t${month}-${year}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  const leaveColumns: Column<Record<string, unknown>>[] = [
    { key: "code", header: "Mã NV", width: "90px", render: (r) => <span className="font-mono text-[12px]">{(r as unknown as LeaveRequest).employee?.code}</span> },
    { key: "name", header: "Họ tên", render: (r) => <span className="font-medium">{(r as unknown as LeaveRequest).employee?.fullName}</span> },
    { key: "dept", header: "Phòng ban", render: (r) => <span style={{ color: "var(--ibs-text-muted)" }}>{(r as unknown as LeaveRequest).employee?.department?.name}</span> },
    { key: "leaveType", header: "Loại nghỉ", render: (r) => <span>{LEAVE_TYPE_LABELS[(r as unknown as LeaveRequest).leaveType] || (r as unknown as LeaveRequest).leaveType}</span> },
    { key: "startDate", header: "Từ ngày", render: (r) => <span>{formatDate(new Date((r as unknown as LeaveRequest).startDate))}</span> },
    { key: "endDate", header: "Đến ngày", render: (r) => <span>{formatDate(new Date((r as unknown as LeaveRequest).endDate))}</span> },
    { key: "totalDays", header: "Số ngày", width: "80px", render: (r) => <span className="font-semibold" style={{ color: "var(--ibs-accent)" }}>{(r as unknown as LeaveRequest).totalDays}</span> },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge status={(r as unknown as LeaveRequest).status} /> },
    {
      key: "actions", header: "", width: "120px",
      render: (r) => {
        const lr = r as unknown as LeaveRequest;
        if (lr.status !== "PENDING") return null;
        return (
          <div className="flex gap-1">
            <button onClick={() => handleLeaveAction(lr.id, "APPROVE")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>
              <Check size={11} /> Duyệt
            </button>
            <button onClick={() => handleLeaveAction(lr.id, "REJECT")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              <X size={11} /> Từ chối
            </button>
          </div>
        );
      },
    },
  ];

  const otColumns: Column<Record<string, unknown>>[] = [
    { key: "code", header: "Mã NV", width: "90px", render: (r) => <span className="font-mono text-[12px]">{(r as unknown as OTRequest).employee?.code}</span> },
    { key: "name", header: "Họ tên", render: (r) => <span className="font-medium">{(r as unknown as OTRequest).employee?.fullName}</span> },
    { key: "dept", header: "Phòng ban", render: (r) => <span style={{ color: "var(--ibs-text-muted)" }}>{(r as unknown as OTRequest).employee?.department?.name}</span> },
    { key: "date", header: "Ngày OT", render: (r) => <span>{formatDate(new Date((r as unknown as OTRequest).date))}</span> },
    { key: "time", header: "Giờ", render: (r) => { const o = r as unknown as OTRequest; return <span>{o.startTime} – {o.endTime}</span>; } },
    { key: "hours", header: "Số giờ", width: "70px", render: (r) => <span className="font-semibold" style={{ color: "var(--ibs-accent)" }}>{(r as unknown as OTRequest).hours.toFixed(1)}h</span> },
    { key: "otRate", header: "Hệ số", width: "70px", render: (r) => <span>×{(r as unknown as OTRequest).otRate}</span> },
    { key: "status", header: "Trạng thái", render: (r) => <StatusBadge status={(r as unknown as OTRequest).status} /> },
    {
      key: "actions", header: "", width: "120px",
      render: (r) => {
        const o = r as unknown as OTRequest;
        if (o.status !== "PENDING") return null;
        return (
          <div className="flex gap-1">
            <button onClick={() => handleOTAction(o.id, "APPROVE")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>
              <Check size={11} /> Duyệt
            </button>
            <button onClick={() => handleOTAction(o.id, "REJECT")}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "var(--ibs-danger)" }}>
              <X size={11} /> Từ chối
            </button>
          </div>
        );
      },
    },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "attendance", label: "Tổng hợp hôm nay" },
    { key: "grid", label: `Bảng công T${month}/${year}` },
    { key: "leave", label: `Đơn nghỉ phép${pendingLeaveCount ? ` (${pendingLeaveCount})` : ""}` },
    { key: "ot", label: `Đề xuất OT${pendingOTCount ? ` (${pendingOTCount})` : ""}` },
  ];

  return (
    <div>
      <PageTitle title="M3 - Chấm công & Nghỉ phép" description="Theo dõi chấm công, đơn nghỉ phép và tăng ca" />

      {/* Month selector + stats */}
      <div className="flex items-center gap-4 mb-5 p-3 rounded-xl border"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <button onClick={prevMonth}
          className="w-8 h-8 rounded-lg border flex items-center justify-center"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-[15px] font-bold min-w-[140px] text-center">
          Tháng {month}/{year}
        </span>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-lg border flex items-center justify-center"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
          <ChevronRight size={14} />
        </button>
        <div className="ml-auto flex items-center gap-6">
          {[
            { value: `${totalPresent}/${totalHeadcount}`, label: "Có mặt hôm nay", color: "var(--ibs-accent)" },
            { value: pendingLeaveCount, label: "Đơn chờ duyệt", color: "var(--ibs-warning)" },
            { value: pendingOTCount, label: "OT chờ duyệt", color: "var(--ibs-text-muted)" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-[22px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--ibs-border)" }}>
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors"
              style={{ borderBottomColor: isActive ? "var(--ibs-accent)" : "transparent", color: isActive ? "var(--ibs-accent)" : "var(--ibs-text-muted)", marginBottom: "-1px" }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Tổng hợp ── */}
      {activeTab === "attendance" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">📅 Tổng hợp có mặt hôm nay</h3>
            <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-xl"
              style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}>● Live</span>
          </div>
          <div className="p-5">
            {loadingSummary ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <div className="space-y-3">
                {summary.map((dept) => {
                  const color = dept.rate === 100 ? "var(--ibs-accent)" : dept.rate >= 90 ? "var(--ibs-success)" : "var(--ibs-warning)";
                  return (
                    <div key={dept.departmentId} className="flex items-center gap-3">
                      <div className="w-[130px] text-[12px] text-right flex-shrink-0" style={{ color: "var(--ibs-text-muted)" }}>{dept.departmentName}</div>
                      <div className="flex-1 h-7 rounded overflow-hidden" style={{ background: "var(--ibs-bg)" }}>
                        <div className="h-full rounded flex items-center pl-3 text-[12px] font-semibold text-white"
                          style={{ width: `${dept.rate}%`, background: color, minWidth: "40px" }}>
                          {dept.rate}%
                        </div>
                      </div>
                      <div className="w-[60px] text-[12px] font-semibold text-right flex-shrink-0" style={{ color }}>
                        {dept.present}/{dept.total}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Bảng công tháng ── */}
      {activeTab === "grid" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">📋 Bảng công tháng {month}/{year}</h3>
            <button onClick={exportGrid}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>
              <Download size={12} /> Export Excel
            </button>
          </div>
          <div className="p-4 overflow-x-auto">
            {loadingGrid ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : gridEmployees.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu chấm công tháng {month}/{year}</p>
              </div>
            ) : (
              <table className="border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 px-3 py-2 text-left font-semibold border-r border-b whitespace-nowrap"
                      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)", minWidth: "120px" }}>Họ tên</th>
                    <th className="px-2 py-2 font-semibold border-r border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>PB</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const dow = new Date(year, month - 1, d).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <th key={d} className="w-8 py-2 font-semibold border-r border-b text-center"
                          style={{ borderColor: "var(--ibs-border)", color: isWeekend ? "var(--ibs-warning)" : "var(--ibs-text-dim)" }}>
                          {d}
                        </th>
                      );
                    })}
                    <th className="px-2 py-2 font-semibold border-b"
                      style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {gridEmployees.map((emp) => {
                    let totalWork = 0;
                    return (
                      <tr key={emp.code}>
                        <td className="sticky left-0 px-3 py-1.5 border-r border-b whitespace-nowrap"
                          style={{ background: "var(--ibs-bg-card)", borderColor: "rgba(51,65,85,0.4)" }}>
                          <span className="font-medium">{emp.fullName}</span>
                          <span className="ml-1 text-[10px]" style={{ color: "var(--ibs-text-dim)" }}>({emp.code})</span>
                        </td>
                        <td className="px-2 py-1.5 border-r border-b text-center"
                          style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-text-dim)" }}>
                          {emp.dept?.replace("P. ", "")}
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                          const rec = emp.days[d];
                          const sym = rec ? ATTENDANCE_SYMBOL[rec.status] : null;
                          if (rec?.status === "PRESENT" || rec?.status === "LATE") totalWork++;
                          if (rec?.status === "HALF_DAY") totalWork += 0.5;
                          const dow = new Date(year, month - 1, d).getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          return (
                            <td key={d} className="w-8 py-1.5 border-r border-b text-center font-semibold"
                              style={{ borderColor: "rgba(51,65,85,0.4)", background: isWeekend ? "rgba(245,158,11,0.04)" : undefined }}>
                              {sym ? (
                                <span style={{ color: sym.color, fontSize: "10px" }}>{sym.symbol}</span>
                              ) : (
                                <span style={{ color: "rgba(51,65,85,0.5)" }}>·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 border-b text-center font-semibold"
                          style={{ borderColor: "rgba(51,65,85,0.4)", color: "var(--ibs-accent)" }}>
                          {totalWork}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {/* Legend */}
            <div className="flex gap-4 mt-3 flex-wrap">
              {Object.entries(ATTENDANCE_SYMBOL).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1 text-[11px]" style={{ color: "var(--ibs-text-muted)" }}>
                  <span className="font-semibold" style={{ color: v.color }}>{v.symbol}</span>
                  {k === "PRESENT" ? "Có mặt" : k === "ABSENT_APPROVED" ? "Nghỉ phép" : k === "ABSENT_UNAPPROVED" ? "Nghỉ KP" : k === "LATE" ? "Đi muộn" : k === "BUSINESS_TRIP" ? "Công tác" : "Nửa ngày"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Đơn nghỉ phép ── */}
      {activeTab === "leave" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">📋 Đơn nghỉ phép</h3>
            <button onClick={() => setShowLeaveForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <Plus size={13} /> Nộp đơn nghỉ
            </button>
          </div>
          <div className="p-5">
            {loadingLeave ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <DataTable columns={leaveColumns} data={leaveRequests as unknown as Record<string, unknown>[]}
                searchPlaceholder="Tìm tên, phòng ban..." searchKeys={["name", "dept"]} pageSize={15} />
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Đề xuất OT ── */}
      {activeTab === "ot" && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-4 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ibs-border)" }}>
            <h3 className="text-sm font-semibold">⏱ Đề xuất tăng ca (OT)</h3>
            <button onClick={() => setShowOTForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
              style={{ background: "var(--ibs-accent)" }}>
              <Plus size={13} /> Đề xuất OT
            </button>
          </div>
          <div className="p-5">
            {loadingOT ? (
              <div className="flex items-center justify-center py-12 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
                <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <DataTable columns={otColumns} data={otRequests as unknown as Record<string, unknown>[]}
                searchPlaceholder="Tìm tên, phòng ban..." searchKeys={["name", "dept"]} pageSize={15} />
            )}
          </div>
        </div>
      )}

      {showLeaveForm && (
        <LeaveRequestForm
          onClose={() => setShowLeaveForm(false)}
          onSuccess={(lr) => { setLeaveRequests((p) => [lr, ...p]); setShowLeaveForm(false); }}
        />
      )}
      {showOTForm && (
        <OTRequestForm
          onClose={() => setShowOTForm(false)}
          onSuccess={(o) => { setOTRequests((p) => [o, ...p]); setShowOTForm(false); }}
        />
      )}
    </div>
  );
}

// ── Leave Request Form ──
function LeaveRequestForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (lr: LeaveRequest) => void }) {
  const [form, setForm] = useState({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/leave-requests")
      .then((r) => r.json()).then((res) => {
        // Try to infer balance from API — placeholder: show from notifications or employee detail
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/v1/leave-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message || "Có lỗi xảy ra"); return; }
      onSuccess(data.data);
    } finally { setSubmitting(false); }
  }

  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const inputClass = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl border w-full max-w-[460px] p-6"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[16px] font-bold">Nộp đơn nghỉ phép</h3>
          <button onClick={onClose}><X size={16} style={{ color: "var(--ibs-text-dim)" }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Loại nghỉ</label>
            <select value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
              className={inputClass} style={inputStyle}>
              {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Từ ngày</label>
              <input type="date" required value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Đến ngày</label>
              <input type="date" required value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Lý do</label>
            <textarea required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Nêu lý do nghỉ phép..." className={`${inputClass} resize-none`} style={inputStyle} />
          </div>
          <div className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "rgba(0,180,216,0.08)", color: "var(--ibs-text-muted)", border: "1px solid rgba(0,180,216,0.2)" }}>
            ℹ️ Workflow: Bạn → Trưởng phòng duyệt → HCNS xác nhận
          </div>
          {error && <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ibs-accent)" }}>{submitting ? "Đang gửi..." : "Gửi đơn"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── OT Request Form ──
function OTRequestForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (o: OTRequest) => void }) {
  const [form, setForm] = useState({ date: "", startTime: "17:30", endTime: "20:00", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/v1/ot-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message || "Có lỗi xảy ra"); return; }
      onSuccess(data.data);
    } finally { setSubmitting(false); }
  }

  const inputStyle = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const inputClass = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="rounded-2xl border w-full max-w-[420px] p-6"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[16px] font-bold">Đề xuất tăng ca (OT)</h3>
          <button onClick={onClose}><X size={16} style={{ color: "var(--ibs-text-dim)" }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Ngày OT</label>
            <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Giờ bắt đầu</label>
              <input type="time" required value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Giờ kết thúc</label>
              <input type="time" required value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--ibs-text-muted)" }}>Lý do OT</label>
            <textarea required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Nêu lý do tăng ca..." className={`${inputClass} resize-none`} style={inputStyle} />
          </div>
          {error && <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)" }}>{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-muted)" }}>Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ibs-accent)" }}>{submitting ? "Đang gửi..." : "Gửi đề xuất"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
